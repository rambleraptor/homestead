/**
 * The sections of a store a grocery item can be shelved in, in the order a
 * shopper usually walks them. An item's section is its `category` (a section
 * id), set by `groceries:categorize`; an item with none hasn't been sorted yet.
 *
 * Shared by the method (the options it puts to the model) and the list (the
 * order and headings it draws), so the two can't drift.
 */

export interface StoreSection {
  /** Stored in `grocery.category`. Never rename one: rows hold it. */
  id: string;
  label: string;
  /** What belongs here, as the model is told. */
  description: string;
}

export const STORE_SECTIONS: readonly StoreSection[] = [
  { id: 'produce', label: 'Produce', description: 'Fresh fruit, vegetables, fresh herbs, salad.' },
  { id: 'bakery', label: 'Bakery', description: 'Bread, rolls, bagels, tortillas, cakes, pastries.' },
  { id: 'deli', label: 'Deli', description: 'Sliced deli meat and cheese, prepared meals, hummus, fresh dips.' },
  { id: 'meat-seafood', label: 'Meat & Seafood', description: 'Raw meat, poultry, fish, shellfish, bacon, sausage.' },
  { id: 'dairy-eggs', label: 'Dairy & Eggs', description: 'Milk, cheese, yogurt, butter, cream, eggs, refrigerated milk alternatives.' },
  { id: 'frozen', label: 'Frozen', description: 'Frozen meals, frozen vegetables and fruit, ice cream, frozen pizza.' },
  { id: 'pantry', label: 'Pantry', description: 'Canned and jarred food, pasta, rice, grains, cereal, baking supplies, oils, spices, sauces, condiments.' },
  { id: 'snacks', label: 'Snacks', description: 'Chips, crackers, cookies, candy, nuts, granola bars.' },
  { id: 'beverages', label: 'Beverages', description: 'Water, soda, juice, coffee, tea, beer, wine.' },
  { id: 'household', label: 'Household', description: 'Cleaning supplies, paper towels, toilet paper, laundry, trash bags, foil, batteries.' },
  { id: 'personal-care', label: 'Personal Care', description: 'Soap, shampoo, toothpaste, deodorant, medicine, vitamins, first aid.' },
  { id: 'baby', label: 'Baby', description: 'Diapers, wipes, formula, baby food.' },
  { id: 'pets', label: 'Pets', description: 'Pet food, treats, litter.' },
  { id: 'other', label: 'Other', description: 'Anything that fits none of the other sections, or is not something a grocery store sells.' },
];

const RANK = new Map(STORE_SECTIONS.map((section, index) => [section.id, index]));
const BY_ID = new Map(STORE_SECTIONS.map((section) => [section.id, section]));

/** The section an item is in, or undefined when it hasn't been sorted (or holds an id we don't know). */
export function sectionOf(category: string | null | undefined): StoreSection | undefined {
  return category ? BY_ID.get(category) : undefined;
}

/**
 * Where an item sorts within its store: unsorted items first (a just-added
 * item stays at the top, where it appeared), then the sections in walking order.
 */
export function sectionRank(category: string | null | undefined): number {
  return (category ? RANK.get(category) : undefined) ?? -1;
}
