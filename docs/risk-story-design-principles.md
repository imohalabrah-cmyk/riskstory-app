# Risk Story Design Principles v1

## Purpose

This document is the decision-making reference for every current and future Risk Story screen. It defines how the product should help a user understand the market; it is not a visual specification for colors, buttons, or design tokens.

Every new feature and material screen review must use these principles before implementation is approved.

## 1. Reduce Cognitive Load

Ask: **How much does the user need to hold in their mind to understand this screen?**

The user's attention belongs to market interpretation, not to decoding the interface. Reduce simultaneous choices, unexplained metrics, and context the user must remember between sections.

## 2. Attention Before Information

Do not start with every available data point. Start with what deserves attention now. The most important information must find the user; the user should not need to search for it.

## 3. Understanding Before Exploration

Screens should follow this order:

1. **Attention**: where should the user look?
2. **Understanding**: why does it matter?
3. **Evidence**: what data supports it?
4. **Exploration**: where can the user inspect the detail?

## 4. One Screen, One Primary Question

Each screen must answer one primary question clearly.

| Screen | Primary question |
| --- | --- |
| Chart | Where is price, and what is acting on it? |
| Heatmap | Where is exposure concentrated? |
| GEX Intelligence | Which exposure levels matter most, and why? |
| Market Story | Where should attention go today, and why? |

If a screen attempts to answer several equally important questions, simplify or separate the experience.

## 5. Complex Engine, Simple Experience

Internal calculations may be sophisticated. That does not require exposing their complexity by default.

**Hide complexity without hiding capability.** Reveal the supporting mechanics only when the user asks for them.

## 6. Progressive Disclosure

Show the big picture first. Put deeper metrics and controls behind details, drawers, hover states, or exploration views when they are not needed for the first reading.

## 7. Highlight Importance, Not Quantity

More data is not inherently more useful. Give visual priority to the strongest, most unusual, and most relevant information. Noise reduction is a product responsibility.

## 8. Never Fake Confidence

Use `unavailable`, `awaiting data`, or `N/A` when real data is absent. Never replace missing data with zero, invented scores, or language that implies certainty the data cannot support.

Explain uncertainty as clearly as confidence.

## 9. Explain Before You Impress

The intended response is not “the interface is beautiful”; it is “I understand.” Visual hierarchy, motion, and color must serve understanding rather than compete with it.

## 10. Guide Attention, Do Not Demand Attention

Use a quiet hierarchy:

1. Primary
2. Secondary
3. Context
4. Details

If everything is prominent, nothing is prominent.

## 11. Data Supports the Story

Risk Story does not invent a story and then look for confirming data. A story must be derived from available data and outputs. When the evidence is mixed, the product must be able to say the picture is unclear.

## 12. No Recommendation Disguised as Intelligence

Do not frame analysis as a recommendation. Avoid terms such as `Buy`, `Sell`, `Guaranteed`, `Strong Buy`, `Strong Sell`, and `Price Target`.

Prefer descriptive language such as `Strong Level`, `High Confluence`, `High Exposure`, `Isolated Level`, `Low Exposure Interval`, and `Market Clarity`. The user decides what to do.

## 13. The Three-Second Rule

Within about three seconds of opening a screen, a user should know:

- where to begin looking;
- what the primary element is; and
- which question the screen answers.

If this is unclear, the visual hierarchy needs review.

## 14. The Ten-Second Rule

Within ten seconds, a user should be able to extract the core value of a screen without understanding every detail. This is especially important for Market Story.

## 15. Make the User Feel Smarter, Not the Product

Use the system's complexity to reduce the user's work. The desired outcome is: **“I understood the market faster.”**

## 16. Consistency of Mental Model

Use the same mental sequence across screens whenever possible:

**Attention -> Understanding -> Evidence -> Exploration**

Users should not have to learn a new way to think for every page.

## 17. Unavailable Is a State, Not a Broken Page

When data is unavailable, retain a recognizable page structure with honest skeletons, disabled controls, placeholders, and explanation. The user should understand that the page exists and data is unavailable, not that the page is broken.

## 18. Every Feature Must Earn Its Attention Cost

Before adding a feature, ask:

- What value does it add?
- How much attention does it take from the user?

Do not place a feature in the primary interface when its attention cost exceeds its value.

## 19. Remove Before Adding

Before adding an element, check whether it can be combined, simplified, moved deeper, or replaced by removing something else. Quality comes from the precision of what the product declines to show.

## 20. Risk Story Product Test

Before approving a screen or feature, verify:

- How much does the user need to think to understand it?
- Where does the eye go first?
- Is the most important information clear?
- Is anything visible that the user does not need now?
- Does the interface hide useful complexity or necessary capability?
- Can every number or score explain its source?
- Is the unavailable state honest?
- Does the screen help the user think about the market rather than the interface?
- Can removing something improve the experience?
- Can a new user understand the core value within ten seconds?

## Core Philosophy

> “The user should think about the market, not about the interface.”

> “Hide complexity without hiding capability.”

> “Attention before information.”

> “Understanding before exploration.”

> “Do not make the user search for the story inside the data. Let the data tell the story.”

> “Do not make the user search for where to begin. Guide attention first.”

> “The best interface is the one the user stops noticing.”
