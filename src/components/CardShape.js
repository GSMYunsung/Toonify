import Svg, { Path, Circle, Polygon } from "react-native-svg";

const SHAPE_COLORS = ["#aebf92", "#ffc6a5", "#c67139", "#d67f48", "#8fa073", "#9ba8cc", "#f5c0a0", "#b8cfa8"];

function h(id, seed) {
  let n = seed * 7;
  for (let i = 0; i < Math.min((id || "").length, 8); i++) {
    n = (n * 31 + id.charCodeAt(i)) % 97;
  }
  return n;
}

export function blobIndex(id) { return h(id, 1) % 3; }

function starPoints(cx, cy, outer, inner) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    pts.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`);
  }
  return pts.join(" ");
}

export default function CardShape({ id }) {
  const type  = h(id, 0) % 3;
  const color = SHAPE_COLORS[h(id, 2) % SHAPE_COLORS.length];
  if (type === 0) {
    return (
      <Svg width={34} height={34} viewBox="0 0 44 44">
        <Polygon points={starPoints(22, 22, 19, 9)} fill={color} stroke={color} strokeWidth={6} strokeLinejoin="round" />
      </Svg>
    );
  }
  if (type === 1) {
    return (
      <Svg width={34} height={34} viewBox="0 0 44 44">
        <Path d="M22 37 C22 37 4 25 4 14 C4 7.5 9 4 14 4 C17.5 4 20 6 22 9 C24 6 26.5 4 30 4 C35 4 40 7.5 40 14 C40 25 22 37 22 37Z" fill={color} stroke={color} strokeWidth={5} strokeLinejoin="round" strokeLinecap="round" />
      </Svg>
    );
  }
  return (
    <Svg width={34} height={34} viewBox="0 0 44 44">
      <Circle cx={22} cy={22} r={18} fill={color} />
    </Svg>
  );
}
