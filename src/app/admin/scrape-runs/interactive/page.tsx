import InteractiveScrapeForm from "@/components/admin/InteractiveScrapeForm";

export const metadata = {
  title: "Interactive scrape · Admin",
};

export default function InteractiveScrapePage() {
  return (
    <div className="space-y-8">
      <h1 className="text-xl font-bold text-white sm:text-2xl">Interactive scrape</h1>
      <InteractiveScrapeForm />
    </div>
  );
}
