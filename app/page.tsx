import { RiskStoryApp } from "./components/risk-story-app";
import { IntelligenceSelectionProvider } from "./lib/intelligence/selection-context";

export default function Home() {
  return <IntelligenceSelectionProvider><RiskStoryApp /></IntelligenceSelectionProvider>;
}
