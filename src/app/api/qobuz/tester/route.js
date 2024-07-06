import ModuleInterface from "@/services/qobuz/moduleinterface";

export async function GET(req) {
  try {
    const qobuz = new ModuleInterface();
    //await qobuz.login();
    const trackinfo = await qobuz.getAlbumInfo("4050538155013");

    console.log(trackinfo.quality)

    return new Response(JSON.stringify({ trackinfo }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error processing request:", error);
    return new Response(JSON.stringify({ message: error.message }), {
      status: 500,
    });
  }
}
