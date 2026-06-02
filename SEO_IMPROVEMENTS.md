# Tensor Lab SEO Improvements

Implemented on May 28, 2026.

Google can choose not to show a favicon or logo even when every requirement is met, but these changes make the site eligible and much easier to understand as the official Tensor Lab website.

1. Added `/favicon.ico`: gives browsers and crawlers the conventional root-level favicon URL.
2. Added `/favicon-48x48.png`: provides a stable square favicon larger than Google's recommended 48px baseline.
3. Added `/favicon-192x192.png`: improves icon clarity on high-density search and browser surfaces.
4. Added `/apple-touch-icon.png`: supplies a recognizable brand icon for Apple and mobile surfaces.
5. Added `assets/seo/tensor-lab-logo-112.png`: meets Google's minimum 112px logo guideline for organization logo markup.
6. Added `assets/seo/tensor-lab-logo-512.png`: provides a higher-resolution crawlable organization logo.
7. Added `assets/seo/tensor-lab-logo-white-bg-512.png`: gives a white-background variant for surfaces that mask or flatten transparent icons.
8. Added `assets/seo/tensor-lab-social-card.png`: creates a 1200x630 image for rich link previews and image previews.
9. Added `site.webmanifest`: connects the site name, short name, description, theme color, and icon set.
10. Added `theme-color` metadata: makes browser/search UI use the Tensor Lab brand color.
11. Added favicon links on every public page: helps crawlers discover the icon consistently from any entry page.
12. Added manifest links on every public page: improves site identity discovery beyond the homepage.
13. Added homepage `Organization` JSON-LD: names The Tensor Lab and points Google to the preferred logo URL.
14. Added organization logo data to all key page JSON-LD graphs: reinforces a consistent entity across the site.
15. Added `WebSite` JSON-LD: defines the canonical site name and publisher.
16. Added `SearchAction` JSON-LD: tells search systems where Tensor Lab project searches can resolve.
17. Added query-param project search support: makes `projects-2026.html?search=...` actually populate the project search UI.
18. Added `EducationalOccupationalProgram` JSON-LD: clarifies the fellowship as a ten-week educational research program.
19. Added homepage `FAQPage` JSON-LD: makes the core fellowship questions machine-readable.
20. Added `BreadcrumbList` JSON-LD to public pages: clarifies page hierarchy and canonical navigation paths.
21. Added `CollectionPage` JSON-LD to the 2026 projects page: identifies it as a research portfolio collection.
22. Added `ItemList` JSON-LD for all 15 2026 projects: exposes project names, topics, and URLs to search engines.
23. Added `CollectionPage` JSON-LD to the 2025 cohort page: identifies the page as an archive of cohort results.
24. Added `ItemList` JSON-LD for the seven 2025 projects: exposes historical research outcomes to crawlers.
25. Added `AboutPage` JSON-LD to the team page: clarifies that the page describes Tensor Lab leadership.
26. Added `Person` schema for directors and faculty advisors: improves expertise and entity recognition.
27. Rewrote page titles to be more specific: helps search results show relevant, differentiated title links.
28. Added page-specific meta descriptions: improves snippet quality and reduces duplicate-page ambiguity.
29. Added canonical URLs to every public page: prevents duplicate URL signals and consolidates ranking signals.
30. Added `hreflang="en-us"` self references: clarifies the language and regional targeting.
31. Added `robots` meta directives: keeps public pages indexable and enables large image previews where useful.
32. Added targeted keyword metadata: helps non-Google and internal crawlers categorize the pages.
33. Added Open Graph titles and descriptions across pages: improves previews in social and messaging search surfaces.
34. Added `og:site_name` and `og:locale`: reinforces brand and language metadata.
35. Replaced old Open Graph image references with the new social card: avoids huge/irregular logo assets in previews.
36. Added Open Graph image dimensions and alt text: improves crawler confidence and accessibility of previews.
37. Added Twitter/X card metadata: improves search-adjacent link previews.
38. Added `sitemap.xml`: gives crawlers an explicit list of canonical public URLs.
39. Added an image entry to the sitemap: points crawlers directly to the preferred Tensor Lab logo.
40. Added `robots.txt`: exposes the sitemap location and guides crawler behavior.
41. Blocked `/archive/` in `robots.txt`: prevents old duplicate pages from competing with current content.
42. Blocked `/apps-script/` in `robots.txt`: keeps implementation source files out of search results.
43. Added `llms.txt`: improves discoverability for AI assistants and answer engines that look for site summaries.
44. Added project collection structured data: exposes 2026 project names to crawlers without changing visible page copy.
45. Added stable project fragment URLs: lets each project have a shareable, crawlable in-page target.
46. Added generated project card IDs and labels: improves accessibility and hash-link behavior after hydration.
47. Preserved the original homepage H1 while moving brand disambiguation into metadata and Organization schema.
48. Added semantic `<main>` landmarks to team, cohort, privacy, and terms pages: improves document structure for crawlers and assistive tech.
49. Preserved the original image alt text while identifying the preferred logo through structured data and the sitemap.
50. Added image width/height attributes: reduces layout shift, which supports user experience and technical SEO.
51. Added `decoding="async"` and lazy loading where appropriate: reduces render blocking and improves perceived performance.
52. Added a preload for the primary logo on the homepage: prioritizes the most important brand image.
53. Added a `shortcut icon` fallback on every public page: gives Google and legacy crawlers another supported favicon hint.
54. Added `TensorLab` as a no-space alternate brand name in metadata and Organization/WebSite schema: improves matching for searches typed as `tensorlab`.

## Google Search References

- Organization logo structured data: https://developers.google.com/search/docs/appearance/structured-data/organization
- Favicons in Google Search results: https://developers.google.com/search/docs/appearance/favicon-in-search
