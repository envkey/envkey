const pastTenseExceptions: Record<string, string> = {
  are: "were",
  eat: "ate",
  go: "went",
  have: "had",
  inherit: "inherited",
  is: "was",
  run: "ran",
  sit: "sat",
  visit: "visited",
  connect: "connected",
  accept: "accepted",
};

// grammatically predictable rules
export const getPastTense = (verb: string) => {
  if (pastTenseExceptions[verb]) {
    return pastTenseExceptions[verb];
  }
  if (/e$/i.test(verb)) {
    return verb + "d";
  }
  if (/[aeiou]c/i.test(verb)) {
    return verb + "ked";
  }
  // for american english only
  if (/el$/i.test(verb)) {
    return verb + "ed";
  }
  if (/[aeio][aeiou][dlmnprst]$/.test(verb)) {
    return verb + "ed";
  }
  if (/[aeiou][bdglmnprst]$/i.test(verb)) {
    return verb.replace(/(.+[aeiou])([bdglmnprst])/, "$1$2$2ed");
  }
  return verb + "ed";
};
