window.DATA_SITE = {
  name: "Harshvardhan Rathod",
  title: "Systems Engineer & Low-Latency Programmer",
  eyebrow: "B.Tech ECE · MIT World Peace University, Pune",
  tagline: "Systems engineer focused on low-latency programming, memory management, and OS-level optimisation — with a strong competitive programming foundation.",
  profileImage: "assets/images/profile.png",
  availability: "Intern @ pravii Technologies and Industry solutions",
  footerLocation: "MIT World Peace University, Kothrud, Pune, India",
  stats: [
    { value: "966 - Newbie", label: "Codeforces" },
    { value: "1367 - 2★", label: "CodeChef" },
    { value: "500+", label: "Problems Solved" },
    { value: "8.88", label: "SGPA (Sem I)" }
  ],
  ctas: [
    { label: "Contact me", url: "#contact", type: "primary" },
    { label: "GitHub", url: "https://github.com/HAPPIOcrz007", type: "ghost" },
    { label: "LinkedIn", url: "https://www.linkedin.com/in/harshvardhan-rathod-436624293/", type: "ghost" },
    { label: "Coding Profile", url: "https://codolio.com/profile/Happiocrz", type: "ghost"}
  ],
  contact: {
    intro: "Open to internship opportunities, research collaborations, and discussions on systems programming, hardware design, or competitive programming. I respond within 24 hours.",
    emails: [
      { label: "primary", address: "hmr280606@gmail.com" }
    ],
    phones: [
      { label: "mobile", number: "+91 77092 85391" }
    ],
    links: [
      { platform: "LinkedIn", url: "https://www.linkedin.com/in/harshvardhan-rathod-436624293/", handle: "harshvardhan-rathod" },
      { platform: "GitHub", url: "https://github.com/HAPPIOcrz007", handle: "HAPPIOcrz007" },
      { platform: "Codeforces", url: "https://codeforces.com/profile/Harshvardhan_Rathod", handle: "Harshvardhan · 966" }
    ]
  }
};
document.getElementById('resumeBtn').addEventListener('click', async (e) => {
    e.preventDefault();
    
    // Build resume from existing data
    const site = window.DATA_SITE;
    const skills = window.DATA_SKILLS;
    const projects = window.DATA_PROJECTS;
    
    let resumeContent = `# ${site.name}\n\n`;
    resumeContent += `${site.tagline}\n\n`;
    resumeContent += `## Contact\n- Email: ${site.contact?.emails?.[0]?.address}\n\n`;
    resumeContent += `## Skills\n`;
    skills.forEach(skill => {
        resumeContent += `### ${skill.category}\n`;
        resumeContent += `${skill.items.join(', ')}\n\n`;
    });
    resumeContent += `## Projects\n`;
    projects.forEach(project => {
        resumeContent += `### ${project.title}\n`;
        resumeContent += `${project.shortDesc}\n`;
        resumeContent += `Technologies: ${project.tech.join(', ')}\n\n`;
    });
    
    // Download
    const blob = new Blob([resumeContent], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Harshvardhan_Rathod_Resume.md';
    a.click();
    URL.revokeObjectURL(url);
});