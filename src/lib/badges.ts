/**
 * The app's badges and drinks, as the site shows them. Names and blurbs are the app's own
 * (BadgeCatalog.all and DrinkPreset.catalog); art keys match src/lib/generated/art.json.
 */

export type BadgeCategory = "pacing" | "weekly" | "mornings" | "bounce" | "social" | "seasonal";

export interface Badge {
  /** The app's id for the badge. */
  slug: string;
  name: string;
  blurb: string;
  category: BadgeCategory;
  /** Hidden in the app until it is earned. */
  secret: boolean;
  /** Key in art.json; files are public/art/<art>-200 and -400. */
  art: string;
}

export interface Drink {
  /** The app's preset id. */
  id: string;
  name: string;
  note: string;
  /** Key in art.json; files are public/art/<art>-160 and -320. */
  art: string;
}

/** Section titles from the app's trophy room. */
export const categoryLabels: Record<BadgeCategory, string> = {
  pacing: "Pacing and technique",
  weekly: "Weeks",
  mornings: "Mornings",
  bounce: "Showing up",
  social: "Crew",
  seasonal: "Seasonal",
};

/** The app's ids are the names in kebab case, with one exception that is passed in by hand. */
const kebab = (name: string) =>
  name
    .toLowerCase()
    .replace(/'/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

function badge(name: string, blurb: string, category: BadgeCategory, options: { secret?: boolean; slug?: string } = {}): Badge {
  const slug = options.slug ?? kebab(name);
  return { slug, name, blurb, category, secret: options.secret ?? false, art: `badge-${slug}` };
}

export const badges: Badge[] = [
  // Pacing and technique
  badge("Pacer", "Every drink at least an hour apart, all night.", "pacing"),
  badge("Hydro Homie", "Water between every drink.", "pacing"),
  // The app's blurb uses a word the site's copy check does not allow, so this one line is reworded.
  badge("Zebra", "Alternated alcohol-free drinks and drinks with alcohol all night.", "pacing"),
  badge("Closed the Tab", "Stopped at or before your last call.", "pacing"),
  badge("Slow Start", "First drink an hour or more after the night began.", "pacing"),
  badge("Lid On", "Stopped at your cap exactly, on a real night.", "pacing", { secret: true }),
  badge("Big Night, Small Tab", "Five-plus hours out, three drinks or fewer.", "pacing", { secret: true }),
  badge("Early Bird Special", "Closed a night before 11pm.", "pacing", { secret: true }),
  // Weeks
  badge("Under Budget", "Weeks in a row under your weekly budget.", "weekly"),
  badge("Two-Day Dry", "Drink-free days in one week.", "weekly"),
  badge("Half Pour", "A week at half your baseline or less.", "weekly"),
  badge("Cash Back", "Money kept versus your old baseline.", "weekly"),
  badge("Designated", "Declared a dry night out and kept it.", "weekly"),
  badge("Dry Tuesday", "The same weekday dry four times in a month.", "weekly", { slug: "dry-weekday" }),
  badge("Water Weight", "Waters logged, lifetime.", "weekly"),
  // Mornings
  badge("Sunrise Club", "Checked in before 8am after a night out.", "mornings"),
  badge("Sunday Scaries Dodged", "A weekend with both nights on plan.", "mornings"),
  badge("Hangover-Free Weekend", "Three weekends in a row of good mornings.", "mornings"),
  badge("Clear Head", "Mornings you rated good.", "mornings"),
  // Bouncing back and showing up
  badge("Bounce Back", "Went over, then the next night was on plan.", "bounce", { secret: true }),
  badge("Honest Log", "Logged a night that went over, in full. Logging it is the win.", "bounce"),
  badge("Reflected", "Did the morning check-in after an over night.", "bounce"),
  badge("Still Here", "Weeks with any logging at all.", "bounce"),
  badge("Plan Ahead", "Set tonight's plan before 6pm.", "bounce"),
  // Crew
  badge("Wingperson", "Kudos given to your crew.", "social"),
  badge("Crew Night", "Whole crew on plan the same night.", "social"),
  badge("Challenge Finisher", "Finished a crew challenge.", "social"),
  badge("First Round's On Me", "Invited a friend who joined.", "social"),
  // Seasonal
  badge("Dry-ish January", "January at half your baseline or less.", "seasonal"),
  badge("Sober-ish October", "October at half your baseline or less.", "seasonal"),
  badge("Long Weekend Survivor", "A three-day weekend, every night on plan.", "seasonal"),
];

const SCENERY = "Scenery. There is no badge for ordering one.";

function drink(id: string, name: string, note = SCENERY): Drink {
  return { id, name, note, art: `drink-${id}` };
}

export const drinks: Drink[] = [
  drink("beer-12-5", "Beer"),
  drink("beer-16-5", "Pint"),
  drink("ipa-16-7", "IPA pint"),
  drink("wine-5-12", "Wine"),
  drink("wine-6-13", "Big pour"),
  drink("shot-1.5-40", "Shot"),
  drink("double-3-40", "Double"),
  drink("cocktail-2-40", "Cocktail"),
  drink("margarita", "Margarita"),
  drink("seltzer-12-5", "Seltzer"),
  drink("cider-16-5", "Cider"),
  drink("na-beer", "NA beer", "The alcohol-free one."),
  drink("water", "Water", "The one drink here with badges to its name."),
];
