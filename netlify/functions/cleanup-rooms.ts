import { NetlifyStore } from "../../server/store";
export default async () => {
  await new NetlifyStore().cleanup();
};
export const config = { schedule: "*/5 * * * *" };
