import Tidal from "@/services/tidal/tidal";

export async function GET(req) {
  try {
    const tidal = new Tidal({
      tvToken: process.env.TV_TOKEN,
      tvSecret: process.env.TV_SECRET,
      accessToken: null,
      refreshToken: null,
    });

    const linkUrl = await tidal.getTokens();

    return new Response(JSON.stringify({ linkUrl }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error processing request:", error);
    return new Response(JSON.stringify({ message: error.message }), {
      status: 500,
    });
  }
}
