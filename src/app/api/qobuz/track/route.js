import ModuleInterface from "@/services/qobuz/moduleinterface";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const trackId = searchParams.get("trackId");

    // Validación de trackId
    if (!trackId) {
      return new Response(JSON.stringify({ error: "trackId is required" }), {
        status: 400,
      });
    }

    const moduleInterface = new ModuleInterface();
    await moduleInterface.login();

    let controllerClosed = false;

    return new Response(
      new ReadableStream({
        async start(controller) {
          const updateProgress = (progress, message) => {
            if (!controllerClosed) {
              controller.enqueue(`data: ${JSON.stringify({ progress, message })}\n\n`);
            }
          };

          try {
            const downloadResult = await moduleInterface.getByUrl(trackId, updateProgress);
            if (!controllerClosed) {
              controller.enqueue(
                `data: ${JSON.stringify({
                  message: downloadResult,
                  progress: 100,
                })}\n\n`
              );
              controller.close();
              controllerClosed = true;
            }
          } catch (error) {
            console.error("Error downloading track or album:", error);
            if (!controllerClosed) {
              controller.enqueue(`data: ${JSON.stringify({ error: `Error downloading track or album: ${error.message}` })}\n\n`);
              controller.close();
              controllerClosed = true;
            }
          }
        },
        cancel() {
          console.log("Stream cancelled");
          controllerClosed = true;
        },
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
