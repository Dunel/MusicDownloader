import ModuleInterface from "@/services/qobuz/moduleinterface";

export async function GET(request, { params }) {
  try {
    const artistId = params.artistId;
    console.log(params);

    if (!artistId) {
      return Response.json(
        { error: "Track ID is required" },
        {
          status: 400,
        }
      );
    }
    const moduleInterface = new ModuleInterface();
    await moduleInterface.login();

    new Response(
      new ReadableStream({
        async start(controller) {
          let downloadProgress = 0;

          const updateProgress = (progress) => {
            downloadProgress = progress;
            controller.enqueue(`data: ${JSON.stringify({ progress })}\n\n`);
          };

          try {
            const downloadResult = await moduleInterface.getArtistDownload(
              albumId,
              updateProgress
            );
            controller.enqueue(
              `data: ${JSON.stringify({
                message: downloadResult,
                progress: 100,
              })}\n\n`
            );
            controller.close();
          } catch (error) {
            console.error("Error downloading album:", error);
            controller.error("Error downloading album");
          }
        },
        cancel() {
          console.log("Stream cancelled");
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
    /*const trackInfo = await moduleInterface.getArtistDownload(artistId);
    return Response.json(
      { trackInfo  },
      {
        status: 200,
      }
    );*/
  } catch (error) {
    console.log(error);
    return Response.json(
      { message: error },
      {
        status: error.code,
      }
    );
  }
}
