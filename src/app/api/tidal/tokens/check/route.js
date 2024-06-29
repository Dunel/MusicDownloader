import Tidal from "@/services/tidal/tidal";

export async function GET(req) {
  try {
    const config = {
      coversDownload: false,
      lyricsDownload: false
    }
    const tidal = new Tidal(config);

    const tokens = await tidal.getTestTrack(346800956)

    return new Response(JSON.stringify({tokens}), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error processing request:", error);
    return new Response(JSON.stringify({ message: error.message }), {
      status: 500,
    });
  }
}
