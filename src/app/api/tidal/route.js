import Tidal from "@/services/tidal/tidal";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const tidalUrl = searchParams.get("url");

    if (!tidalUrl) {
      return new Response(JSON.stringify({ error: "URL is required" }), {
        status: 400,
      });
    }

    const tidal = new Tidal({
      tvToken: process.env.TV_TOKEN,
      tvSecret: process.env.TV_SECRET,
      accessToken: process.env.ACCESS_TOKEN,
      refreshToken: process.env.REFRESH_TOKEN,
    });

    let controllerClosed = false;

    return new Response(
      new ReadableStream({
        async start(controller) {
          const progressStream = (progress, message) => {
            if (!controllerClosed) {
              controller.enqueue(`data: ${JSON.stringify({ progress, message })}\n\n`);
            }
          };

          try {
            progressStream(0, "Starting download...");
            const trackInfo = await tidal.getByUrl(tidalUrl, progressStream);

            // controller.enqueue(`data: ${JSON.stringify({ progress: 100, message: trackInfo })}\n\n`);
            controller.close();
            controllerClosed = true;
          } catch (error) {
            progressStream(100, `Error: ${error.message}`);
            controllerClosed = true;
            controller.enqueue(`data: ${JSON.stringify({ error: error.message })}\n\n`); 
            controller.close();
          }
        },
        pull(controller) {},
        cancel(reason) {
        }
      }),
      {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      }
    );
  } catch (error) {
    return new Response(JSON.stringify({ message: error.message }), {
      status: 500,
    });
  }
}
