# Chemistry Practice Notes

## 1. Balancing Chemical Equations

A chemical equation shows reactants → products. You often need to balance it so atoms are conserved.

Example: combustion of methane
Unbalanced:

```text
CH₄ + O₂ → CO₂ + H₂O
```

Balanced:

```text
CH₄ + 2 O₂ → CO₂ + 2 H₂O
```

In LaTeX form (with subscripts written using math):

$ \text{CH}_4 + 2,\text{O}_2 \rightarrow \text{CO}_2 + 2,\text{H}_2\text{O} $

---

## 2. Stoichiometry Example

Say we burn hydrogen in oxygen to form water:

$ 2,\text{H}_2 + \text{O}_2 \rightarrow 2,\text{H}_2\text{O} $

If you start with 4 molecules of $\text{H}_2$ and plenty of $\text{O}_2$, you can make 4 molecules of $\text{H}_2\text{O}$ because the mole ratio $\text{H}_2 : \text{H}_2\text{O}$ is $2:2 = 1:1$.

---

## 3. Acid–Base Neutralization

General pattern:

**Acid + Base → Salt + Water**

Example: Hydrochloric acid + sodium hydroxide:

$ \text{HCl} + \text{NaOH} \rightarrow \text{NaCl} + \text{H}_2\text{O} $

Ionic view (strong acid/base written as ions):

$ \text{H}^+ + \text{OH}^- \rightarrow \text{H}_2\text{O} $

pH definition:

$ \text{pH} = -\log_{10} [\text{H}^+] $

---

## 4. Precipitation Reaction

When two aqueous ionic solutions react and form an insoluble solid (a precipitate).

Example: mixing aqueous silver nitrate and sodium chloride:

$ \text{AgNO}_3,(aq) + \text{NaCl},(aq) \rightarrow \text{AgCl},(s) + \text{NaNO}_3,(aq) $

Net ionic form (just the stuff that actually changes):

$ \text{Ag}^+ (aq) + \text{Cl}^- (aq) \rightarrow \text{AgCl} (s) $

---

## 5. Le Châtelier's Principle / Equilibrium

Consider the synthesis of ammonia (Haber process):

$ \text{N}_2 (g) + 3,\text{H}_2 (g) \rightleftharpoons 2,\text{NH}_3 (g) $

The equilibrium constant expression:

$$
K_c = \frac{[\text{NH}_3]^2}{[\text{N}_2][\text{H}_2]^3}
$$

If you increase $[\text{N}_2]$ or $[\text{H}_2]$, the system will shift to make more $\text{NH}_3$.

---

## 6. Redox (Oxidation–Reduction)

Magnesium reacting with oxygen:

$ 2,\text{Mg} + \text{O}_2 \rightarrow 2,\text{MgO} $

Oxidation half-reaction (Mg loses electrons):

$ \text{Mg} \rightarrow \text{Mg}^{2+} + 2,e^- $

Reduction half-reaction (O₂ gains electrons):

$ \tfrac{1}{2}\text{O}_2 + 2,e^- \rightarrow \text{O}^{2-} $

Together those make solid magnesium oxide $\text{MgO}$.

---

## 7. Ideal Gas Law (often used with reactions that make / consume gas)

Ideal gas law:

$$
PV = nRT
$$

Where

* $P$ = pressure,
* $V$ = volume,
* $n$ = moles of gas,
* $R$ = gas constant,
* $T$ = temperature in Kelvin.

Example: If a reaction doubles the moles of gas ($n$ doubles) at the same $P$ and $T$, the volume $V$ must also double.

---

## 8. Sample Worked Multi-Step Problem

**Problem:**
Given the balanced equation

$ \text{CaCO}_3 (s) \rightarrow \text{CaO} (s) + \text{CO}_2 (g) $

1. Balance?
   Already balanced: $1:1:1$.

2. If you start with 1.00 mol of $\text{CaCO}_3$, how many moles of $\text{CO}_2$ are produced?
   The mole ratio $\text{CaCO}_3 : \text{CO}_2$ is $1:1$, so you get 1.00 mol $\text{CO}_2$.

3. If that $\text{CO}_2$ is collected at $P = 1.00\ \text{atm}$ and $T = 298\ \text{K}$, what volume $V$ do you expect (ideal gas)?

Use $PV = nRT$:

$$
V = \frac{nRT}{P}
$$

Plug in one set of common units:

* $n = 1.00\ \text{mol}$
* $R = 0.08206\ \frac{\text{L}\cdot\text{atm}}{\text{mol}\cdot\text{K}}$
* $T = 298\ \text{K}$
* $P = 1.00\ \text{atm}$

$$
V \approx (1.00)(0.08206)(298) \ \text{L} \approx 24.5\ \text{L}
$$

---

## 9. Quick Reference Summary

**Key reaction types:**

* Combustion: $ \text{Fuel} + \text{O}_2 \rightarrow \text{CO}_2 + \text{H}_2\text{O} $
* Acid/Base: $ \text{H}^+ + \text{OH}^- \rightarrow \text{H}_2\text{O} $
* Precipitation: $ \text{Ag}^+ + \text{Cl}^- \rightarrow \text{AgCl} (s) $
* Redox: electrons move $e^-$ (oxidation = lose $e^-$, reduction = gain $e^-$)

**Math you’ll see a lot:**

* $ \text{pH} = -\log_{10}[\text{H}^+] $
* $ K_c = \dfrac{[\text{products}]^{\text{coeff}}}{[\text{reactants}]^{\text{coeff}}} $
* $ PV = nRT $
