import Storage from "expo-sqlite/kv-store";
export function readLocal(): string | null {
  return Storage.getItemSync("leadrove:v1");
}
export function writeLocal(value: string) {
  Storage.setItemSync("leadrove:v1", value);
}
