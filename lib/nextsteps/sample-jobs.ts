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

/**
 * SAMPLE internships across fields, for the same reason as the jobs above: made up, labelled "Sample" wherever shown. They replace the home page's
 * mostly-technical demo list so that a marketing, finance or design student is not shown a machine learning internship.
 */
export interface SampleInternship {
  id: string;
  title: string;
  company: string;
  place: string;
  remote: boolean;
  stipend: number;
  weeks: number;
  skills: string[];
  domains: string[];
}

export const SAMPLE_INTERNSHIPS: SampleInternship[] = [
  { id: "i-ml", title: "Machine Learning Intern", company: "Synapse AI", place: "Remote", remote: true, stipend: 25000, weeks: 12, skills: ["Python", "scikit-learn", "Statistics", "Pandas", "Git"], domains: ["ai", "data"] },
  { id: "i-da", title: "Data Analyst Intern", company: "Northgate Analytics", place: "Hyderabad", remote: false, stipend: 20000, weeks: 12, skills: ["SQL", "Excel", "Power BI", "Python", "Tableau"], domains: ["data", "finance", "ai"] },
  { id: "i-be", title: "Backend Developer Intern", company: "CodeForge Systems", place: "Hyderabad", remote: false, stipend: 22000, weeks: 16, skills: ["Node.js", "SQL", "REST APIs", "Git", "Java"], domains: ["software", "cloud"] },
  { id: "i-fe", title: "Frontend Developer Intern", company: "Northwind Labs", place: "Remote", remote: true, stipend: 18000, weeks: 12, skills: ["React", "CSS", "JavaScript", "Git"], domains: ["software", "design"] },
  { id: "i-mk", title: "Digital Marketing Intern", company: "Lumen Growth", place: "Remote", remote: true, stipend: 10000, weeks: 12, skills: ["SEO", "Google Analytics", "Social Media", "Content", "Copywriting", "Canva"], domains: ["marketing", "sales"] },
  { id: "i-ct", title: "Content & SEO Intern", company: "Bloom Media", place: "Remote", remote: true, stipend: 8000, weeks: 12, skills: ["Writing", "SEO", "Research", "Content"], domains: ["marketing", "general"] },
  { id: "i-gd", title: "Graphic Design Intern", company: "Inkwell Studio", place: "Remote", remote: true, stipend: 9000, weeks: 8, skills: ["Photoshop", "Illustrator", "Branding", "Figma", "Canva"], domains: ["design", "marketing"] },
  { id: "i-fa", title: "Finance & Accounts Intern", company: "Cresta Capital", place: "Mumbai", remote: false, stipend: 12000, weeks: 12, skills: ["Excel", "Tally", "Accounting", "Financial Modeling"], domains: ["finance", "accounting"] },
  { id: "i-hr", title: "HR & Recruitment Intern", company: "Peoplefirst India", place: "Chennai", remote: false, stipend: 8000, weeks: 10, skills: ["Recruitment", "Communication", "Excel"], domains: ["hr", "operations"] },
  { id: "i-me", title: "Mechanical Design Intern", company: "Vahan Motors", place: "Chennai", remote: false, stipend: 14000, weeks: 12, skills: ["SolidWorks", "CAD", "GD&T"], domains: ["operations", "general"] },
  { id: "i-sec", title: "Security Operations Intern", company: "Ironclad Secure", place: "Mumbai", remote: false, stipend: 15000, weeks: 12, skills: ["Networking", "Linux", "Security", "Python"], domains: ["cybersecurity", "cloud"] },
  { id: "i-pm", title: "Product Management Intern", company: "Orbitly", place: "Bengaluru", remote: true, stipend: 18000, weeks: 12, skills: ["Product", "SQL", "Analytics", "Communication", "Excel"], domains: ["product", "data", "software"] },
];
