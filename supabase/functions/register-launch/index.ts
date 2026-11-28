import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { Interface, getAddress, verifyMessage } from "npm:ethers@6";

const FACTORY_ALLOWLIST = new Set(["0x81C1E1703C35e158912245288684609339A41B37"].map((address) => address.toLowerCase()));
async function isPixorunFactory(address: string) {
  const normalized = getAddress(address);
  if (FACTORY_ALLOWLIST.has(normalized.toLowerCase())) return true;
  try {
    const response = await fetch("https://raw.githubusercontent.com/arifhosen2022/Pixorun-launchpad/main/contracts/deployments/robinhood-testnet.json", { headers: { "cache-control": "no-cache" } });
    if (!response.ok) return false;
    const deployment = await response.json();
    return typeof deployment?.launchpadFactory === "string" && getAddress(deployment.launchpadFactory) === normalized;
  } catch { return false; }
}
const RPC = "https://rpc.testnet.chain.robinhood.com";
const ABI = ["event LaunchCreated(address indexed creator,address indexed token,address indexed curve,string name,string symbol)"];
const iface = new Interface(ABI);
const topic = iface.getEvent("LaunchCreated")!.topicHash;
const cors = {
  "Access-Control-Allow-Origin": "https://launchpad.pixorun.xyz",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });
async function rpc(method: string, params: unknown[]) {
  const response = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  if (!response.ok) throw new Error("Robinhood RPC request failed");
  const result = await response.json();
  if (result.error) throw new Error(result.error.message || "Robinhood RPC error");
  return result.result;
}
function clean(value: unknown, max: number) {
  const s = typeof value === "string" ? value.trim() : "";
  if (s.length > max) throw new Error("Metadata field exceeds its allowed length");
  return s || null;
}
function validUrl(value: string | null, label: string, hosts?: RegExp) {
  if (!value) return;
  let u: URL;
  try { u = new URL(value); } catch { throw new Error("Invalid " + label + " URL"); }
  if (!["https:", "http:"].includes(u.protocol) || (hosts && !hosts.test(u.hostname))) throw new Error("Invalid " + label + " URL");
}
async function saveAsset(admin: any, token: string, asset: any, kind: string) {
  if (!asset) return null;
  const allowed: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };
  if (!allowed[asset.mime]) throw new Error("Unsupported " + kind + " image type");
  if (typeof asset.base64 !== "string" || !/^[A-Za-z0-9+/]*={0,2}$/.test(asset.base64)) throw new Error("Invalid image data");
  const bytes = Uint8Array.from(atob(asset.base64), c => c.charCodeAt(0));
  if (!bytes.length || bytes.length > 2 * 1024 * 1024) throw new Error("Each image must be 2 MB or smaller");
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  const actualHash = Array.from(digest, b => b.toString(16).padStart(2, "0")).join("");
  if (actualHash !== String(asset.sha256 || "").toLowerCase()) throw new Error(kind + " image checksum mismatch");
  const path = token.toLowerCase() + "/" + kind + "." + allowed[asset.mime];
  const { error } = await admin.storage.from("token-assets").upload(path, bytes, { contentType: asset.mime, upsert: true, cacheControl: "31536000" });
  if (error) throw error;
  return Deno.env.get("SUPABASE_URL") + "/storage/v1/object/public/token-assets/" + path;
}
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);
  try {
    const body = await req.json();
    const txHash = body?.txHash;
    if (typeof txHash !== "string" || !/^0x[a-fA-F0-9]{64}$/.test(txHash)) return reply({ error: "Valid transaction hash required" }, 400);
    const [tx, receipt] = await Promise.all([
      rpc("eth_getTransactionByHash", [txHash]),
      rpc("eth_getTransactionReceipt", [txHash])
    ]);
    if (!tx || !receipt) return reply({ error: "Transaction is not confirmed yet" }, 409);
    if (receipt.status !== "0x1") return reply({ error: "Launch transaction failed on-chain" }, 400);
    if (!tx.to || !(await isPixorunFactory(tx.to))) return reply({ error: "Transaction was not sent to a verified PIXORUN Launchpad Factory" }, 400);
    const factoryAddress = getAddress(tx.to);
    const parsed = (receipt.logs || []).filter((log: any) => getAddress(log.address) === factoryAddress).map((log: any) => {
      try { return iface.parseLog({ topics: log.topics, data: log.data }); } catch { return null; }
    }).find((event: any) => event?.name === "LaunchCreated");
    if (!parsed) return reply({ error: "LaunchCreated event not found in transaction receipt" }, 400);
    if (getAddress(parsed.args.creator) !== getAddress(tx.from)) return reply({ error: "Creator does not match transaction sender" }, 400);

    const tokenAddress = getAddress(parsed.args.token);
    const curveAddress = getAddress(parsed.args.curve);
    const creatorAddress = getAddress(parsed.args.creator);
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!supabaseUrl || !serviceKey) throw new Error("Supabase server environment is not configured");
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const record: Record<string, unknown> = {
      chain_id: 46630,
      token_address: tokenAddress,
      curve_address: curveAddress,
      creator_address: creatorAddress,
      token_name: String(parsed.args.name),
      token_symbol: String(parsed.args.symbol),
      tx_hash: txHash.toLowerCase(),
      block_number: Number(BigInt(receipt.blockNumber)),
      tx_value_wei: String(BigInt(tx.value || "0")),
      gas_used: String(BigInt(receipt.gasUsed || "0")),
      effective_gas_price_wei: String(BigInt(receipt.effectiveGasPrice || tx.gasPrice || "0")),
      token_decimals: 18,
      total_supply_wei: "1000000000000000000000000000",
      updated_at: new Date().toISOString()
    };

    const metadataInput = body?.metadata;
    const logo = body?.logo || null;
    const banner = body?.banner || null;
    if (metadataInput || logo || banner) {
      const metadata = {
        description: clean(metadataInput?.description, 1000),
        websiteUrl: clean(metadataInput?.websiteUrl, 300),
        xUrl: clean(metadataInput?.xUrl, 300),
        telegramUrl: clean(metadataInput?.telegramUrl, 300)
      };
      validUrl(metadata.websiteUrl, "website");
      validUrl(metadata.xUrl, "X", /(^|\.)((x|twitter)\.com)$/i);
      validUrl(metadata.telegramUrl, "Telegram", /(^|\.)((t\.me|telegram\.me))$/i);
      const logoHash = logo ? String(logo.sha256 || "").toLowerCase() : "";
      const bannerHash = banner ? String(banner.sha256 || "").toLowerCase() : "";
      for (const hash of [logoHash, bannerHash]) if (hash && !/^[a-f0-9]{64}$/.test(hash)) throw new Error("Invalid image checksum");
      const message = "PIXORUN_TOKEN_METADATA_V1\n" + txHash.toLowerCase() + "\n" + JSON.stringify(metadata) + "\n" + logoHash + "\n" + bannerHash;
      if (typeof body?.signature !== "string" || getAddress(verifyMessage(message, body.signature)) !== creatorAddress) {
        return reply({ error: "Wallet signature does not match the token creator. Metadata was not saved." }, 403);
      }
      const imageUrl = await saveAsset(admin, tokenAddress, logo, "logo");
      const bannerUrl = await saveAsset(admin, tokenAddress, banner, "banner");
      Object.assign(record, {
        description: metadata.description,
        website_url: metadata.websiteUrl,
        x_url: metadata.xUrl,
        telegram_url: metadata.telegramUrl,
        ...(imageUrl ? { image_url: imageUrl } : {}),
        ...(bannerUrl ? { banner_url: bannerUrl } : {}),
        metadata_updated_at: new Date().toISOString(),
        metadata_json: metadata,
        metadata_signature: body.signature,
        metadata_version: 1,
        logo_sha256: logoHash || null,
        banner_sha256: bannerHash || null
      });
    }
    // Preserve previously saved metadata when the same launch is re-registered
    // without a metadata payload (e.g. a retry of the initial chain-only sync).
    const { data: existing, error: lookupError } = await admin.from("token_launches")
      .select("*").eq("chain_id", 46630).eq("token_address", tokenAddress).maybeSingle();
    if (lookupError) throw lookupError;
    const durableRecord = existing ? { ...existing, ...record } : record;
    const { data, error } = await admin.from("token_launches")
      .upsert(durableRecord, { onConflict: "chain_id,token_address" }).select().single();
    if (error) throw error;
    return reply({ success: true, launch: data });
  } catch (error) {
    console.error("register-launch error", error);
    return reply({ error: error instanceof Error ? error.message : "Could not register launch" }, 500);
  }
});