import { ImageResponse } from "next/og";

export const dynamic = "force-static";

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#18181b",
          color: "white",
          fontSize: 288,
        }}
      >
        ♪
      </div>
    ),
    { width: 512, height: 512 },
  );
}
