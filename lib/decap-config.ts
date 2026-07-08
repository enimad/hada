type DecapConfigOptions = {
  localBackend?: boolean;
  siteUrl?: string;
};

export function buildDecapConfig({ localBackend = false, siteUrl = "https://hadawedding.fr" }: DecapConfigOptions = {}) {
  const backend = localBackend
    ? `local_backend: true

backend:
  name: git-gateway`
    : `backend:
  name: github
  repo: enimad/hada
  branch: main
  base_url: ${siteUrl}
  auth_endpoint: api/decap/auth`;
  const publishMode = localBackend ? "" : "publish_mode: editorial_workflow\n";

  return `${backend}

locale: fr
site_url: ${siteUrl}
display_url: ${siteUrl}
logo_url: /brand/hada-wordmark.png
${publishMode}media_folder: public/uploads/blog
public_folder: /uploads/blog

collections:
  - name: blog
    label: Articles du Blog Hada
    label_singular: Article
    folder: content/blog
    create: true
    slug: "{{slug}}"
    summary: "{{title}} - {{publishedAt}}"
    fields:
      - { label: Brouillon, name: draft, widget: boolean, default: false, required: false }
      - { label: Titre, name: title, widget: string }
      - { label: Slug URL, name: slug, widget: string, hint: "Exemple : comment-choisir-son-lieu-de-mariage" }
      - { label: Description courte, name: description, widget: text, hint: "Résumé visible en haut de l'article." }
      - { label: Catégorie, name: category, widget: select, options: ["Organisation", "Budget", "Prestataires", "Lieu de réception", "Inspiration", "Planning"] }
      - { label: Date de publication, name: publishedAt, widget: datetime, format: "YYYY-MM-DDTHH:mm:ss.SSSZ", date_format: "YYYY-MM-DD", time_format: "HH:mm", picker_utc: false }
      - { label: Date de mise à jour, name: updatedAt, widget: datetime, required: false, format: "YYYY-MM-DDTHH:mm:ss.SSSZ", date_format: "YYYY-MM-DD", time_format: "HH:mm", picker_utc: false }
      - { label: Image principale, name: heroImage, widget: image }
      - { label: Texte alternatif image, name: heroAlt, widget: string }
      - { label: Extrait carte blog, name: excerpt, widget: text }
      - { label: Titre SEO, name: seoTitle, widget: string }
      - { label: Description SEO, name: seoDescription, widget: text }
      - { label: Lien vidéo optionnel, name: videoUrl, widget: string, required: false, hint: "Coller ici un lien YouTube, Vimeo, Loom ou Google Drive. Ne pas uploader de vidéo lourde dans Git." }
      - { label: Contenu, name: body, widget: markdown }
`;
}

export const decapConfig = buildDecapConfig();
