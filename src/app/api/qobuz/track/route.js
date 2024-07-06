import ModuleInterface from "@/services/qobuz/moduleinterface";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const trackId = searchParams.get("trackId");
    const cover = searchParams.get("cover");

    // Validación de trackId
    if (!trackId) {
      return new Response(JSON.stringify({ error: "trackId is required" }), {
        status: 400,
      });
    }
    const config = {
      covers: cover == "true" ? true : false,
    };

    const moduleInterface = new ModuleInterface(config);
    //await moduleInterface.login();

    let controllerClosed = false;

    return new Response(
      new ReadableStream({
        async start(controller) {
          const progressStream = (progress, message) => {
            if (!controllerClosed) {
              controller.enqueue(
                `data: ${JSON.stringify({ progress, message })}\n\n`
              );
            }
          };

          try {
            progressStream(0, "Starting download...");
            const trackInfo = await moduleInterface.getByUrl(
              trackId,
              progressStream
            );

            // controller.enqueue(`data: ${JSON.stringify({ progress: 100, message: trackInfo })}\n\n`);
            controller.close();
            controllerClosed = true;
          } catch (error) {
            progressStream(100, `Error: ${error.message}`);
            controllerClosed = true;
            controller.enqueue(
              `data: ${JSON.stringify({ error: error.message })}\n\n`
            );
            controller.close();
          }
        },
        pull(controller) {},
        cancel(reason) {},
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
    console.error("Error processing request:", error);
    return new Response(JSON.stringify({ error: "Error processing request" }), {
      status: 500,
    });
  }
}
