export function BrandMark({
  size = "md",
  light = false,
  align = "center",
}: {
  size?: "sm" | "md" | "lg";
  light?: boolean;
  align?: "center" | "start";
}) {
  const title =
    size === "lg" ? "text-4xl sm:text-5xl" : size === "sm" ? "text-xl" : "text-2xl";

  return (
    <div
      className={`flex flex-col ${align === "center" ? "items-center" : "items-start"}`}
    >
      <span
        className={`font-semibold tracking-tight ${title} ${
          light ? "text-white" : "text-white"
        }`}
      >
        Foto Keluarga
      </span>
    </div>
  );
}

const COVER_TONES = [
  "from-[#2a2a2c] to-[#141416]",
  "from-[#323234] to-[#1a1a1c]",
  "from-[#2c3038] to-[#16181c]",
  "from-[#332c30] to-[#1a1618]",
  "from-[#2c3228] to-[#161814]",
  "from-[#302c38] to-[#18161c]",
];

export function albumCoverClass(id: string) {
  let hash = 0;
  for (const char of id) hash = (hash + char.charCodeAt(0) * 17) % COVER_TONES.length;
  return COVER_TONES[hash] ?? COVER_TONES[0];
}
