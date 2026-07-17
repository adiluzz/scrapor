import { redirect } from "next/navigation";

/** Video Agent UI removed — clips live under Ad clips / Video editor. */
export default function VideoAgentRedirect() {
  redirect("/admin/ad-clips");
}
