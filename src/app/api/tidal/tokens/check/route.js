import Tidal from "@/services/tidal/tidal";

let tidal;

export async function GET(req) {
  try {
    if (!tidal) {
      tidal = new Tidal({
        tvToken: "4N3n6Q1x95LL5K7p",
        tvSecret: "oKOXfJW371cX6xaZ0PyhgGNBdNLlBZd4AKKYougMjik=",
        accessToken: 'eyJraWQiOiJ2OU1GbFhqWSIsImFsZyI6IkVTMjU2In0.eyJ0eXBlIjoibzJfYWNjZXNzIiwidWlkIjoxOTg2MDM3NzMsInNjb3BlIjoid191c3Igcl91c3IiLCJnVmVyIjowLCJzVmVyIjoxLCJjaWQiOjY0MzIsImV4cCI6MTcxODcyNzM0Miwic2lkIjoiODI3NzBhOTctNTNjOS00MjU2LTk3Y2YtZTMxNTRjZmU2YjRlIiwiaXNzIjoiaHR0cHM6Ly9hdXRoLnRpZGFsLmNvbS92MSJ9.Xe0CCH47z7NHPiSAFvoO5ODkwzoo_K0T3QIO8qXXYFu1juwoxhMC8ikn2bDM9JcU2GPrQ02VTL2rWVHvTIHXxg',
        refreshToken: 'eyJraWQiOiJoUzFKYTdVMCIsImFsZyI6IkVTNTEyIn0.eyJ0eXBlIjoibzJfcmVmcmVzaCIsInVpZCI6MTk4NjAzNzczLCJzY29wZSI6IndfdXNyIHJfdXNyIiwiY2lkIjo2NDMyLCJzVmVyIjoxLCJnVmVyIjowLCJpc3MiOiJodHRwczovL2F1dGgudGlkYWwuY29tL3YxIn0.AQqa5lxN4toOEvjyhr-ZJyX55Cvtu2kxWLZ0kMQlqFIZMsmR38uu1yBRzZI62omLx_XlxwXwVbFEcPzqHmb-qbIQAbkkhnVsp4-kWSJmBwy22_I8_gzFdxMA1tWXADs_wrWCP4MFOD4cGIZfn-g6KyiBm-2Q9AwntEKQsjd-c1CnBcvt',
      });
    }

    const tokens = tidal.getCurrentConfig();

    if (!tokens.accessToken || !tokens.refreshToken) {
      throw new Error("Tokens not yet available, please authorize the device.");
    }

    return new Response(JSON.stringify(tokens), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error processing request:", error);
    return new Response(JSON.stringify({ message: error.message }), {
      status: 500,
    });
  }
}
