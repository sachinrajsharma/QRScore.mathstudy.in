/**
 * SAMPLE job listings for demonstration. They are made up (the companies do not exist) so the dashboard can show how job recommendations will look
 * before GrowQR has real employer listings. Every place that shows one labels it "Sample". Replace this file's content with a real feed later; the
 * matching code does not change.
 */
export interface SampleJob {
  id: string;
  title: string;
  company: string;
  place: string;
  type: "Full time" | "Part time" | "Contract";
  pay: string;
  skills: string[];
  domains: string[];
}

export const SAMPLE_JOBS: SampleJob[] = [
  { id: "j-swe", title: "Junior Software Engineer", company: "Brightwave Labs", place: "Bengaluru", type: "Full time", pay: "₹5 to 8 LPA", skills: ["Python", "JavaScript", "SQL", "Git", "Java", "React"], domains: ["software", "cloud", "product"] },
  { id: "j-data", title: "Data Analyst", company: "Northgate Analytics", place: "Hyderabad", type: "Full time", pay: "₹4.5 to 7 LPA", skills: ["SQL", "Excel", "Python", "Power BI", "Tableau", "Statistics"], domains: ["data", "ai", "finance"] },
  { id: "j-ml", title: "Machine Learning Associate", company: "Synthia Systems", place: "Remote", type: "Full time", pay: "₹7 to 12 LPA", skills: ["Python", "Machine Learning", "TensorFlow", "Pandas", "Statistics"], domains: ["ai", "data"] },
  { id: "j-cloud", title: "Cloud Support Engineer", company: "Skyfield Cloud", place: "Pune", type: "Full time", pay: "₹4 to 6.5 LPA", skills: ["AWS", "Linux", "Networking", "Docker", "Python"], domains: ["cloud", "cybersecurity", "software"] },
  { id: "j-sec", title: "Security Analyst Trainee", company: "Ironclad Secure", place: "Mumbai", type: "Full time", pay: "₹4 to 6 LPA", skills: ["Networking", "Linux", "Security", "Python"], domains: ["cybersecurity", "cloud"] },
  { id: "j-design", title: "UI/UX Designer", company: "Pixelhouse Studio", place: "Remote", type: "Full time", pay: "₹4 to 7 LPA", skills: ["Figma", "UX", "Wireframing", "Prototyping", "Photoshop"], domains: ["design", "product", "marketing"] },
  { id: "j-mkt", title: "Digital Marketing Executive", company: "Lumen Growth", place: "Delhi", type: "Full time", pay: "₹3 to 5 LPA", skills: ["SEO", "Google Analytics", "Content", "Social Media", "Copywriting"], domains: ["marketing", "sales"] },
  { id: "j-fin", title: "Financial Analyst", company: "Cresta Capital", place: "Mumbai", type: "Full time", pay: "₹5 to 8 LPA", skills: ["Excel", "Financial Modeling", "Accounting", "Valuation", "SQL"], domains: ["finance", "accounting"] },
  { id: "j-hr", title: "HR Executive", company: "Peoplefirst India", place: "Chennai", type: "Full time", pay: "₹3 to 4.5 LPA", skills: ["Recruitment", "Communication", "Excel", "HRIS"], domains: ["hr", "operations"] },
  { id: "j-ops", title: "Operations Coordinator", company: "Gatewise Logistics", place: "Ahmedabad", type: "Full time", pay: "₹3 to 5 LPA", skills: ["Excel", "Operations", "Communication", "Planning"], domains: ["operations", "sales", "general"] },
  { id: "j-pm", title: "Associate Product Manager", company: "Orbitly", place: "Bengaluru", type: "Full time", pay: "₹8 to 14 LPA", skills: ["Product", "SQL", "Communication", "Analytics", "Roadmapping"], domains: ["product", "software", "data"] },
  { id: "j-pt", title: "Part-time Content Writer", company: "Inkwell Media", place: "Remote", type: "Part time", pay: "₹15 to 25k a month", skills: ["Writing", "SEO", "Research", "Content", "Communication"], domains: ["marketing", "general"] },
];
