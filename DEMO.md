# BeautyLens: 3-minute demo script

Golden case: a Cetaphil-style moisturising lotion whose ingredient list a camera misread. All label text below is from the project fixture `backend/fixtures/labels/cetaphil_moisturising_lotion_ocr.json`. The products in step 5 are **illustrative samples**, not real products.

**Numbers below are with PubChem off (repeatable); with PubChem on the split can differ by an item or two.** 

**Setup (before the audience arrives):** open the live link (or `npm run dev` + the Python service). Open `/analyze` once so a sleeping host wakes. Tick **Reduce motion** if the room is bright and the projector is slow.

| Time | Do | Say |
|---|---|---|
| 0:00 | Landing page `/`. Let the entrance play. | "Reading an ingredient label is hard, and apps that score products hide how they decide. BeautyLens does the opposite: it shows where every match comes from and never gives a verdict." |
| 0:20 | Click **Analyze a label**. Point at the privacy line. | "Photos are read in the browser and never uploaded. Only the ingredient text goes to the matching service." |
| 0:35 | Paste the fixture's `raw_ingredients` into the box (copy from the file, or use **Fallback B** below). Paste the front text and dates into the pack boxes. Press **Analyze ingredients**. | "This is what a camera really gives us: ACUA, GLYCERN, ISCPROPIL PIMITATE." |
| 0:55 | Point at the identity summary. | "16 names: 2 matched exactly, 14 need a look. The counts add up on screen, and nothing unresolved is ever green." |
| 1:10 | Scroll to **Review**. Open one card. | "Each suggestion shows its source and why it matched. 'Glycern' is one letter from Glycerin. 'Detry alcohol' could be cetyl or cetearyl; the app shows both and notes they are fatty alcohols, not drying alcohols." |
| 1:35 | **Accept all high-confidence suggestions**, read the list, confirm. Then press **Use this** on the rest. | "It tells me exactly what it will accept before I press. The AI helper is off unless I tick a box, and even then it can only suggest." |
| 1:55 | Scroll to **Claims on the pack**. | "'Vitamin E, B3, B5, avocado oil' match the list. 'No added fragrance' is consistent: benzyl alcohol is a labelled fragrance allergen, but here it sits with other preservatives, and the app spells out that nuance. 'Won't clog pores' and 'non-irritating' are not verifiable from ingredients, so it says so." |
| 2:15 | Point at the date notice. | "Expiry 04/29 was read with low confidence, so it asks me to confirm instead of guessing." |
| 2:25 | **My products** -> **Load illustrative sample products**. Show the routine check. | "A routine with a retinol serum, a benzoyl peroxide gel and a glycolic toner. Each note cites its source, and 'no sunscreen marked in the morning' appears because I marked the types." |
| 2:45 | **Reaction log** -> tick consent -> log *Sample Scented Cream A* and *Sample Scented Lotion B*. | "Two products I reacted to share Parfum and Linalool. It says this may be worth discussing with a dermatologist, and a patch test can help. It never says 'you are allergic'." |
| 3:00 | **Profile** -> **Delete all my data**. | "Everything lived in this browser. One tap and it is gone." |

## If something goes wrong
- **Fallback A, a pre-recorded video:** `docs/demo.webm` (about 75 s, captioned, silent). It shows the same flow end to end. Play it full screen and narrate over it.
- **Fallback B, offline or the service is down:** run the app locally with `npm run dev` and the Python service (no internet needed once the dictionary is built; PubChem and Open Beauty Facts are skipped, and the page says so). The golden text is in `backend/fixtures/labels/cetaphil_moisturising_lotion_ocr.json`; the sample products load with one button and need no network. If the Python service is unreachable the site still works with basic matching and shows "Enhanced recognition unavailable"; say so, and continue with the claims, routine and reaction-log steps.
- **Camera demo:** use pasted text, not a live photo. Local OCR is unreliable on small or curved text (`docs/PHASE2.md`), and a failed live read is the likeliest way for the demo to go wrong.
- **Slow first Analyze on a free host:** the service was asleep. Talk through the privacy diagram on the landing page while it wakes.
