import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { url } = await req.json();
  if (!url) return NextResponse.json({ error: "no_url" }, { status: 400 });

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // timeout 10s

    const res = await fetch(url, { signal: controller.signal, headers: { "User-Agent": "Mozilla/5.0" } });
    clearTimeout(timeout);

    const html = await res.text();

    const getMeta = (prop: string) =>
      html.match(new RegExp(`<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']+)["']`, "i"))?.[1] ??
      html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${prop}["']`, "i"))?.[1];

    const title = getMeta("og:title") ?? html.match(/<title>([^<]+)<\/title>/i)?.[1];
    const description = getMeta("og:description");
    const image = getMeta("og:image");
    const faviconMatch = html.match(/<link[^>]+rel=["'](?:shortcut )?icon["'][^>]+href=["']([^"']+)["']/i);

    return NextResponse.json({
      title: title?.trim(),
      description: description?.trim(),
      image: image ? new URL(image, url).toString() : undefined,
      favicon: faviconMatch ? new URL(faviconMatch[1], url).toString() : undefined,
    });
  } catch {
    // Fallback: salva solo l'URL, nessun blocco dell'utente
    return NextResponse.json({ title: url });
  }
}
