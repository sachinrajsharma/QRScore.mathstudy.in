import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import HomePlans from "@/components/home/HomePlans";
import PartnerStrip from "@/components/home/PartnerStrip";
import FAQ from "@/components/home/FAQ";
import { EnterpriseContactProvider } from "@/components/enterprise/EnterpriseContactModal";
import { planStacks } from "@/lib/pay/plan-value-prices";
import { all as allTemplates } from "@/lib/studio/templates";
import { staticCourses } from "@/lib/market/static-catalogue";
import { COUNTRIES } from "@/components/home-options/data";
import Reveal from "./Reveal";
import Hero from "./Hero";
import Pillars from "./Pillars";
import Discovery from "./Discovery";
import ResumeShowcase from "./ResumeShowcase";
import { Abroad, Opportunities, Learn, Library, HowItWorks3, Trust, FinalCTA3 } from "./Showcases";

/**
 * Homepage v3 composition:
 *   Hero (six-module ecosystem) > Pillars (bento) > Pricing (student packages) > Goal guide > Resume Studio >
 *   Study abroad > Internships > Learning > E-books > How it works > Trust > Partners > FAQ > Final CTA
 */
export default function HomeV3() {
  const templateCount = Object.keys(allTemplates()).length;
  return (
    <>
      <Navbar />
      <EnterpriseContactProvider solution={{ label: "GrowQR Enterprise", heading: "Let's map out your team's rollout" }}>
        <main id="main-content" className="relative">
          <Reveal className="overflow-x-clip">
            <Hero />
            <Pillars />
            <HomePlans stacks={planStacks()} />
            <Discovery counts={{ courses: staticCourses().length, countries: COUNTRIES.length, templates: templateCount }} />
            <ResumeShowcase templateCount={templateCount} />
            <Abroad />
            <Opportunities />
            <Learn />
            <Library />
            <HowItWorks3 />
          </Reveal>
          <Reveal>
            <Trust templateCount={templateCount} />
          </Reveal>
          <PartnerStrip />
          <FAQ />
          <Reveal>
            <FinalCTA3 />
          </Reveal>
        </main>
      </EnterpriseContactProvider>
      <Footer />
    </>
  );
}
