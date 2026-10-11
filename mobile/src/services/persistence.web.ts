export function readLocal(): string | null {
  return typeof localStorage === "undefined"
    ? null
    : localStorage.getItem("leadrove:v1");
}
export function writeLocal(value: string) {
  if (typeof localStorage !== "undefined")
    localStorage.setItem("leadrove:v1", value);
}
