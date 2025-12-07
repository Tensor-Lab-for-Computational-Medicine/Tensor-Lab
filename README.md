# The Tensor Lab for Computational Medicine

[![Live Site](https://img.shields.io/badge/Live-Site-blue?style=flat-square)](https://tensor-lab-for-computational-medicine.github.io/Tensor-Lab/)
[![GitHub Pages](https://img.shields.io/badge/Deployed%20on-GitHub%20Pages-green?style=flat-square)](https://pages.github.com/)
[![License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](LICENSE)

> Connecting computer science students with physician mentors to publish AI research that advances clinical medicine.

## 🌟 About

The Tensor Lab is a student-run organization founded by medical students at UCSF and University of Maryland. We run a **10-week summer fellowship** that pairs computer science students with physician mentors working on real clinical research problems. Fellows gain hands-on experience with medical datasets, mentorship from practicing clinicians, and co-authorship on published research.

**Our Mission:** Bridge the gap between engineering talent and clinical problems—producing AI research that can meaningfully change patient care.

### Why We Exist

- **Engineers build tools doctors won't use** — Without clinical context, even sophisticated models fail in practice
- **Doctors can't validate AI tools** — Most physicians lack the technical background to evaluate AI research critically

We solve this collaboration problem by creating structured research partnerships where CS students bring technical expertise and medical professionals provide clinical context.

## ✨ Key Features

- **🔬 Real Clinical Research** — Work with actual patient data under IRB-approved protocols
- **👨‍⚕️ 1:1 Physician Mentorship** — Direct guidance from practicing clinicians
- **📝 Guaranteed Co-Authorship** — First-author opportunities on research papers
- **🎓 Structured 10-Week Program** — From research question to manuscript submission
- **🏆 2025 Pilot Results** — 7 papers submitted, 100% of fellows gained independent research capability

## 🚀 Live Demo

**Visit:** [https://tensor-lab-for-computational-medicine.github.io/Tensor-Lab/](https://tensor-lab-for-computational-medicine.github.io/Tensor-Lab/)

## 🛠️ Tech Stack

- **Frontend:** Vanilla JavaScript (ES6+), HTML5, CSS3
- **Styling:** Custom CSS with CSS Grid and Flexbox
- **Animations:** Canvas-based starfield background
- **Hosting:** GitHub Pages
- **Design:** Mobile-responsive, modern UI with NASA-inspired space theme

## 📁 Project Structure

```
Tensor-Lab/
├── index.html              # Main HTML structure
├── styles.css              # All styling and responsive design
├── script.js               # Interactive features and animations
├── Logo.png               # Tensor Lab logo
├── assets/                # UI assets and graphics
├── NASA Photos/           # Space-themed background images
├── Portrait Photos/       # Leadership team headshots
├── Poster Images/         # Research poster thumbnails
├── Posters/              # Full research poster PDFs
├── LICENSE               # Project license
└── README.md             # This file
```

## 🏃 Getting Started

### Prerequisites

- A modern web browser (Chrome, Firefox, Safari, Edge)
- Optional: Local web server for development

### Local Development

1. **Clone the repository**
   ```bash
   git clone https://github.com/Tensor-Lab-for-Computational-Medicine/Tensor-Lab.git
   cd Tensor-Lab
   ```

2. **Open in browser**
   
   Simply open `index.html` in your browser, or use a local server:

   ```bash
   # Using Python 3
   python -m http.server 8000
   
   # Using Node.js (http-server)
   npx http-server
   ```

3. **Navigate to**
   ```
   http://localhost:8000
   ```

### Making Changes

- **HTML:** Edit `index.html` for content and structure
- **Styling:** Modify `styles.css` for visual design
- **Interactivity:** Update `script.js` for dynamic features

The site uses vanilla JavaScript with no build process required—changes are immediately visible on refresh.

## 📘 Non-Technical Guide: Editing the Website

**For future directors with no technical background**

This guide will walk you through everything you need to edit the Tensor Lab website, even if you've never coded before. Follow these steps carefully, and you'll be updating the website in no time.

### What You'll Need

Download and install these three free tools:

1. **GitHub Desktop** — Makes it easy to save and sync your changes
   - Download: [desktop.github.com](https://desktop.github.com/)
   - Install by opening the downloaded file and following the prompts

2. **Cursor** — A code editor that helps you edit the website (like Microsoft Word, but for code)
   - Download: [cursor.sh](https://cursor.sh/)
   - Install by opening the downloaded file and dragging to Applications

3. **A GitHub Account** — Free account to manage the website files
   - Sign up: [github.com/signup](https://github.com/signup)
   - Use your Tensor Lab email address

### Step 1: Get Access to the Repository

A "repository" (or "repo") is just a fancy word for a folder that contains all the website files.

1. **Ask the current technical director** to add your GitHub account as a collaborator:
   - They need to go to: `github.com/Tensor-Lab-for-Computational-Medicine/Tensor-Lab`
   - Click `Settings` → `Collaborators` → `Add people`
   - Add your GitHub username

2. **Check your email** for an invitation and click "Accept Invitation"

### Step 2: Clone the Repository (First Time Only)

"Cloning" means downloading a copy of all the website files to your computer so you can edit them.

1. **Open GitHub Desktop**
   
2. **Sign in to your GitHub account**
   - Click `GitHub Desktop` menu → `Preferences` (Mac) or `File` → `Options` (Windows)
   - Click `Accounts` → Sign in with your GitHub account

3. **Clone the repository**
   - Click `File` → `Clone Repository`
   - Click the `URL` tab
   - Paste this URL: `https://github.com/Tensor-Lab-for-Computational-Medicine/Tensor-Lab.git`
   - Choose where to save it (your Documents folder is a good choice)
   - Click `Clone`
   - Wait for the download to complete (may take 1-2 minutes)

✅ **Success!** You now have a copy of all the website files on your computer.

### Step 3: Open the Website in Cursor

1. **Open Cursor** (the code editor you installed)

2. **Open the project folder**
   - Click `File` → `Open Folder`
   - Navigate to where you saved the Tensor-Lab folder (probably in Documents)
   - Select the `Tensor-Lab` folder and click `Open`

3. **You'll see all the website files in the left sidebar:**
   - `index.html` — The main content (text, images, structure)
   - `styles.css` — Colors, fonts, layouts, and visual design
   - `script.js` — Interactive features (animations, buttons)
   - Folders with images and documents

### Step 4: Make Your Edits

#### Editing Text Content

To change any text on the website:

1. **Open `index.html`** by clicking it in the left sidebar

2. **Find the text you want to change**
   - Use `Cmd+F` (Mac) or `Ctrl+F` (Windows) to search for specific text
   - Example: Search for "Summer 2026" to update the application year

3. **Edit the text directly**
   - Just type your changes like you would in Word
   - Be careful not to delete any `<` or `>` symbols around the text
   - Example: Change `<h1>Old Title</h1>` to `<h1>New Title</h1>`

4. **Save your changes**
   - Press `Cmd+S` (Mac) or `Ctrl+S` (Windows)
   - Or click `File` → `Save`

#### Adding New Team Members

1. **Open `index.html`** and search for "Leadership Team"

2. **Find an existing team member block** (it looks like this):

```html
<div class="team-member">
    <img src="Portrait Photos/Aaron Ge.png" alt="Aaron Ge">
    <div>
        <strong>Aaron Ge</strong>
        Co-Founder & Technical Director<br>
        University of Maryland School of Medicine
        <a href="https://linkedin.com/in/aaronge">LinkedIn ↗</a>
    </div>
</div>
```

3. **Copy the entire block** and paste it below the others

4. **Update the information:**
   - Change the image path to the new person's photo
   - Update the name, title, and university
   - Update the LinkedIn URL

5. **Add their photo:**
   - Save their photo in the `Portrait Photos` folder
   - Name it: `FirstName LastName.png` (e.g., `Jane Smith.png`)
   - Make sure it matches the filename in the code

#### Changing Colors or Styles

1. **Open `styles.css`** from the left sidebar

2. **Search for what you want to change:**
   - Colors: Search for `color:` or specific color names
   - Font sizes: Search for `font-size:`
   - Spacing: Search for `margin:` or `padding:`

3. **Edit carefully** — small changes can affect the whole site

4. **Save** with `Cmd+S` or `Ctrl+S`

### Step 5: Preview Your Changes Locally

Before publishing, always check how your changes look:

1. **Find `index.html` in Finder (Mac) or File Explorer (Windows)**
   - It's in the Tensor-Lab folder you cloned

2. **Right-click `index.html` → Open With → Chrome (or your browser)**

3. **The website opens in your browser**
   - This is only visible to you, not the public
   - Refresh the page (`Cmd+R` or `F5`) after making changes

4. **Test on different devices:**
   - Resize your browser window to see mobile view
   - Check that all links work
   - Make sure images load correctly

### Step 6: Save Your Changes (Commit)

Once you're happy with your edits, you need to save them in a way that GitHub understands. This is called a "commit."

1. **Open GitHub Desktop**

2. **You'll see your changes listed**
   - Files you edited will appear with checkmarks
   - Green highlights show what you added
   - Red highlights show what you removed

3. **Write a commit message** (bottom left)
   - Summary: Brief description (e.g., "Update team member photos")
   - Description: Optional details about what you changed

4. **Click "Commit to main"**
   - This saves your changes to your local copy

✅ **Your changes are now saved on your computer**

### Step 7: Upload Your Changes (Push)

Now you need to upload your changes so they appear on the live website:

1. **In GitHub Desktop, click "Push origin"** (top right)
   - This uploads your changes to GitHub
   - Takes 10-30 seconds

2. **Wait 1-2 minutes** for automatic deployment
   - GitHub automatically updates the live website
   - You don't need to do anything else

3. **Check the live website**
   - Visit: [tensor-lab-for-computational-medicine.github.io/Tensor-Lab](https://tensor-lab-for-computational-medicine.github.io/Tensor-Lab/)
   - Refresh the page (`Cmd+R` or `F5`)
   - Your changes should be live!

✅ **Your changes are now live on the website!**

### Step 8: Get Updates from Others (Pull)

Before you start editing, always make sure you have the latest version:

1. **Open GitHub Desktop**

2. **Click "Fetch origin"** (top right)
   - This checks if others made changes

3. **If there are changes, click "Pull origin"**
   - This downloads the latest changes to your computer

4. **Now you're up to date** and can start editing

⚠️ **Important:** Always do this before starting work to avoid conflicts!

### Troubleshooting Common Issues

#### "I made a mistake and want to undo my changes"

**Before pushing to GitHub:**
1. Open GitHub Desktop
2. Right-click the file with changes
3. Click "Discard changes"
4. Your file returns to the previous version

**After pushing to GitHub:**
1. Ask the technical director for help with "reverting" a commit
2. Or contact: aaron@tensorlab.org

#### "GitHub Desktop says there's a conflict"

This happens when you and someone else edited the same part of a file.

1. **Don't panic!** This is normal
2. Open the conflicted file in Cursor
3. Look for sections marked with `<<<<<<<`, `=======`, and `>>>>>>>`
4. Delete the markers and keep the version you want
5. Save the file and commit again

#### "The website looks broken after my changes"

1. **Open GitHub Desktop**
2. **Right-click the problematic file** → "Discard changes"
3. **Or** ask for help in the Tensor Lab Discord
4. **Pro tip:** Make small changes and test frequently

#### "I can't see my changes on the live site"

1. **Hard refresh your browser:**
   - Mac: `Cmd+Shift+R`
   - Windows: `Ctrl+Shift+R`
2. **Wait 2-3 minutes** (deployment can be slow)
3. **Check GitHub:**
   - Go to: `github.com/Tensor-Lab-for-Computational-Medicine/Tensor-Lab/actions`
   - Make sure the latest deployment succeeded (green checkmark)

### Quick Reference: Common Edits

| What to Change | File | Search For |
|---------------|------|-----------|
| Application dates | `index.html` | "Summer 2026" or "Feb 2026" |
| Team member info | `index.html` | "Leadership Team" |
| Fellowship stats | `index.html` | "2025 Pilot Results" |
| Contact email | `index.html` | "@" (search for email addresses) |
| Social media links | `index.html` | "twitter.com" or "discord.gg" |
| Button colors | `styles.css` | `.btn` or `.cta-btn` |
| Header text | `index.html` | `<h1>` or `<h2>` |
| Footer content | `index.html` | `<footer>` |

### Getting Help

If you get stuck or something breaks:

1. **Check this guide** — the answer is usually here
2. **Ask in Tensor Lab Discord** — `#website-support` channel
3. **Email the technical director** — aaron@tensorlab.org
4. **GitHub Desktop Help** — [docs.github.com/en/desktop](https://docs.github.com/en/desktop)

### Video Tutorials (Recommended)

These 5-minute videos explain the basics:
- [How to use GitHub Desktop](https://www.youtube.com/results?search_query=github+desktop+tutorial+beginners)
- [Intro to HTML basics](https://www.youtube.com/results?search_query=html+basics+tutorial)
- [Understanding CSS](https://www.youtube.com/results?search_query=css+basics+tutorial)

### Best Practices

✅ **DO:**
- Pull changes before you start editing
- Make small changes and test frequently
- Write clear commit messages
- Preview changes locally before pushing
- Ask for help when unsure

❌ **DON'T:**
- Edit files directly on GitHub.com (always use Cursor)
- Push changes without testing first
- Delete files unless you're sure
- Edit `script.js` unless you know JavaScript
- Work on the website while someone else is editing

---

**Remember:** You can't permanently break anything! Every change is tracked, and we can always undo mistakes. Don't be afraid to experiment.

## 🌐 Deployment

The site is automatically deployed to GitHub Pages from the `main` branch. Any push to `main` triggers a deployment.

**Deployment URL:** `https://tensor-lab-for-computational-medicine.github.io/Tensor-Lab/`

### Manual Deployment

GitHub Actions handles automatic deployment via `.github/workflows/static.yml`. To manually trigger:

1. Push changes to `main` branch
2. GitHub Actions automatically builds and deploys
3. Changes appear live within 1-2 minutes

## 🎯 Key Sections

### Hero Section
10-week fellowship overview with value propositions and CTA buttons

### About Section
Mission statement, problem definition, and leadership team profiles

### How It Works
Three-role model: CS Fellow, Medical Student, Faculty Physician

### Open Roles
Recruitment sections for medical students, CS students, and chapter leads

### Timeline
Application and fellowship timeline from December 2025 to September 2026

### Testimonials
Fellow stories from the 2025 pilot cohort

### Research Showcase
Featured posters and project deep-dives with filters and modal viewers

### FAQ
Common questions organized by audience (medical students, CS students, general)

### Footer CTA
Final conversion section with application links

## 👥 Leadership Team

- **Aaron Ge** — Co-Founder & Technical Director, UMD School of Medicine
- **Matt Allen** — Co-Founder & Executive Director, UCSF
- **Chy Murali** — Operational Director, UMD School of Medicine
- **Gavin Shu** — Strategic Director, UCSF
- **Angie Lee** — Business Director, UMD School of Medicine

## 📊 2025 Pilot Results

- **7 papers** submitted for publication
- **100%** of fellows understand clinical context better
- **100%** of fellows can lead research independently
- **10 fellows** completed the inaugural cohort

## 🤝 Contributing

We welcome contributions to improve the website! Here's how:

1. **Fork the repository**
2. **Create a feature branch** (`git checkout -b feature/improvement`)
3. **Make your changes** and test thoroughly
4. **Commit** (`git commit -m 'Add feature description'`)
5. **Push** (`git push origin feature/improvement`)
6. **Open a Pull Request**

### Contribution Guidelines

- Maintain mobile responsiveness
- Follow existing code style and conventions
- Test across multiple browsers
- Keep accessibility in mind (semantic HTML, ARIA labels)
- Optimize images before adding to the repo

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 📞 Contact & Social

- **Website:** [tensor-lab-for-computational-medicine.github.io/Tensor-Lab](https://tensor-lab-for-computational-medicine.github.io/Tensor-Lab/)
- **Twitter:** [@TensorLab](https://twitter.com/TensorLab)
- **Discord:** [Join our community](https://discord.gg/tensorlab)
- **GitHub:** [Tensor-Lab-for-Computational-Medicine](https://github.com/Tensor-Lab-for-Computational-Medicine)

## 🎓 For Prospective Fellows

### Medical Students
Have a research idea but don't know how to code? [Submit your project proposal](https://tensor-lab-for-computational-medicine.github.io/Tensor-Lab/#open-roles)

### CS Students
Want to apply AI to healthcare with real mentorship? [Join the waitlist](https://tensor-lab-for-computational-medicine.github.io/Tensor-Lab/#footer-cta) for Summer 2026 applications (opening February 2026)

### Start a Chapter
Want to bring Tensor Lab to your institution? [Apply to start a chapter](https://tensor-lab-for-computational-medicine.github.io/Tensor-Lab/#open-roles)

---

**Built with ❤️ by medical students passionate about bridging AI and clinical medicine**

*Summer 2026 applications opening February 2026*
