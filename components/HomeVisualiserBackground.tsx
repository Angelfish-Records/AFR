import * as React from "react";

export default function HomeVisualiserBackground() {
  return (
    <div
      className="home-visualiser-bg"
      aria-hidden="true"
      style={{
        background:
          "radial-gradient(circle at center, #3b82f6 0%, #020617 70%)",
      }}
    >
      <div className="home-visualiser-veil" />
    </div>
  );
}
