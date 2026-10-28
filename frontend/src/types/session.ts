/**
 * Which side of the card is shown first.
 *
 * Deliberately binary. An earlier third value, "both", drilled each word in
 * each direction, but it made a simple either/or into a three-way choice and
 * meant one word could occupy two slots in a queue — so "how many cards are
 * left" stopped matching "how many words are left".
 */
export type StudyDirection = "front-to-back" | "back-to-front";
