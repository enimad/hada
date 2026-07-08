/**
 * Tests offline du détecteur de pages annuaires (lib/directory-page-detector.ts).
 *
 * Deux familles de fixtures :
 * - mustReject : pages d'annuaires/listings qui ne doivent JAMAIS devenir des fiches ;
 * - mustPass : vraies pages de prestataires qui ne doivent PAS être rejetées (rappel).
 *
 * Usage : npm run test:directory
 */
import { loadDirectoryDetector } from "./lib-loader.mjs";

const { looksLikeDirectoryPage } = loadDirectoryDetector();

const mustReject = [
  // --- Blocklist / hosts connus ---
  { url: "https://www.mariages.net/traiteur-mariage/paris", title: "Traiteurs mariage Paris" },
  { url: "https://www.zankyou.com/fr/f/traiteurs-mariage", title: "Traiteurs de mariage" },
  { url: "https://www.zankyou.fr/f/photographes-mariage-nantes", title: "Photographes" },
  { url: "https://www.pagesjaunes.fr/annuaire/chercherlespros?quoiqui=traiteur", title: "Traiteurs" },
  { url: "https://www.abcsalles.com/salle/paris", title: "Salles de réception à Paris" },
  { url: "https://www.1001salles.com/salles?ville=lyon", title: "Salles Lyon" },
  { url: "https://www.tripadvisor.fr/Restaurants-g187147-Paris.html", title: "Restaurants Paris" },
  { url: "https://www.yelp.fr/search?find_desc=traiteur", title: "Traiteurs" },
  { url: "https://www.google.com/maps/search/traiteur+mariage", title: "Google Maps" },
  { url: "https://www.mariage.com/prestataires", title: "Prestataires de mariage" },

  // --- Formes de hostname génériques (domaines inconnus) ---
  { url: "https://annuaire-mariage.fr/photographes", title: "Photographes de mariage" },
  { url: "https://www.mariage-annuaire.com/traiteurs", title: "Tous les traiteurs" },
  { url: "https://comparateur-mariage.fr/dj", title: "DJ mariage" },

  // --- Formes d'URL (domaines inconnus) ---
  { url: "https://un-site-inconnu.fr/annuaire/photographes-lyon", title: "Photographes à Lyon" },
  { url: "https://quelquesite.fr/prestataires/traiteurs", title: "Traiteurs" },
  { url: "https://site-mariage.fr/recherche?categorie=dj", title: "Résultats" },
  { url: "https://exemple.com/categorie/photographes/", title: "Photographes" },
  { url: "https://exemple.fr/villes/toulouse/traiteurs", title: "Traiteurs Toulouse" },
  { url: "https://blog-mariage.fr/top-10-lieux-reception", title: "Nos coups de cœur" },
  { url: "https://site.fr/les-meilleurs-traiteurs-de-lyon", title: "Découvrez notre guide" },
  { url: "https://plateforme.fr/profil/jean-photographe", title: "Jean Photographe" },

  // --- Formes de titre/description (URL neutre) ---
  { url: "https://un-site.fr/page", title: "Les 10 meilleurs traiteurs de mariage à Toulouse" },
  { url: "https://un-site.fr/page", title: "Top 15 des lieux de réception en Île-de-France" },
  { url: "https://un-site.fr/page", title: "Annuaire des photographes de mariage" },
  { url: "https://un-site.fr/page", title: "Comparez les devis de traiteurs" },
  { url: "https://un-site.fr/page", title: "Trouvez votre DJ de mariage idéal" },
  { url: "https://un-site.fr/page", title: "Liste des fleuristes mariage à Nantes" },
  { url: "https://un-site.fr/page", title: "Photographe mariage Toulouse : prix et photos" },
  { url: "https://un-site.fr/page", title: "Salles des fêtes — avis et devis en ligne" },
  { url: "https://un-site.fr/page", title: "Tous les traiteurs de la région parisienne" },
  { url: "https://un-site.fr/page", title: "25 lieux de mariage incontournables en Provence" },
  { url: "https://un-site.fr/page", title: "Sélection des plus beaux domaines de Provence" },
  { url: "https://un-site.fr/page", description: "Demandez des devis gratuits à des centaines de prestataires." }
];

const mustPass = [
  { url: "https://www.chateaudelacroix.fr/", title: "Château de la Croix – Lieu de réception mariage Toulouse" },
  { url: "https://juliemartin-photographe.fr/portfolio/mariage-toulouse", title: "Julie Martin — Photographe de mariage" },
  { url: "https://traiteur-lemoine.fr/nos-menus-mariage", title: "Traiteur Lemoine | Devis gratuit" },
  { url: "https://domainedesroses.fr/nos-salles/", title: "Nos salles — Domaine des Roses" },
  { url: "https://www.dj-anim-events.fr/prestations-mariage", title: "DJ Anim'Events - Animation de votre mariage" },
  { url: "https://fleursdelune.fr/contact", title: "Fleurs de Lune, fleuriste à Annecy" },
  { url: "https://photographe-lyon-durand.fr/", title: "Paul Durand Photographe Lyon — 10 ans d'expérience" },
  { url: "https://www.latabledemarie.fr/traiteur-mariage-bordeaux", title: "La Table de Marie — Traiteur événementiel Bordeaux" },
  { url: "https://chateaubellevue.fr/recevoir/mariages", title: "Mariages au Château Bellevue" },
  { url: "https://studiolumiere.fr/tarifs", title: "Studio Lumière — Tarifs mariage" },
  { url: "https://www.orchestre-nova.fr/repertoire", description: "Orchestre live pour mariages et événements. Demandez un devis gratuit." },
  { url: "https://films-eternels.fr/films-de-mariage", title: "Films Éternels — Vidéaste mariage" },
  { url: "https://larobeblanche.fr/collections", title: "La Robe Blanche — Boutique de robes de mariée Paris" },
  { url: "https://transports-prestige.fr/mariage", title: "Location de voiture avec chauffeur pour votre mariage" },
  { url: "https://www.manoirduparc.com/en/weddings", title: "Weddings at Manoir du Parc" },
  { url: "https://traiteur-royal.fr/", title: "Élu meilleur traiteur de Lyon en 2024" }
];

let failures = 0;

console.log("=== Pages annuaires : doivent être rejetées ===");
for (const fixture of mustReject) {
  const rejected = looksLikeDirectoryPage(fixture);
  if (!rejected) failures += 1;
  console.log(`${rejected ? "PASS" : "FAIL"} rejet: ${fixture.url} ${fixture.title ? `« ${fixture.title} »` : ""}`);
}

console.log("\n=== Pages prestataires : doivent passer ===");
for (const fixture of mustPass) {
  const rejected = looksLikeDirectoryPage(fixture);
  if (rejected) failures += 1;
  console.log(`${rejected ? "FAIL" : "PASS"} rappel: ${fixture.url} ${fixture.title ? `« ${fixture.title} »` : ""}`);
}

const total = mustReject.length + mustPass.length;
if (failures > 0) {
  console.error(`\n${failures}/${total} fixtures en échec.`);
  process.exit(1);
}
console.log(`\nDétecteur d'annuaires : ${total} fixtures OK.`);
