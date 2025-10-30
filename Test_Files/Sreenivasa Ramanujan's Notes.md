# Ramanujan Notes

Srinivasa Ramanujan (1887–1920) was famous for wild, compact formulas that looked impossible but turned out to be true.
Below are a few of his greatest hits: partitions, $1/\pi$, continued fractions, and infinite series.

---

## 1. Partition Function ( p(n) )

The partition function ( p(n) ) counts how many ways you can write ( n ) as a sum of positive integers, order ignored.

Example:

* For ( n = 4 ):

  * (4)
  * (3+1)
  * (2+2)
  * (2+1+1)
  * (1+1+1+1)

So ( p(4) = 5 ).

Ramanujan (with Hardy) found an asymptotic formula:

```math
p(n) \sim \frac{1}{4n\sqrt{3}}
\exp\!\left( \pi \sqrt{\frac{2n}{3}} \right)
\quad \text{as } n \to \infty
```

This means: for large ( n ), you can *approximate* how many partitions exist using that exponential expression.
People were stunned because partitions felt “number theory,” but here’s an exponential with ( \pi ) in it.

He also discovered exact congruences like:

```math
p(5k + 4) \equiv 0 \pmod{5}
```

```math
p(7k + 5) \equiv 0 \pmod{7}
```

```math
p(11k + 6) \equiv 0 \pmod{11}
```

These say: for those specific arithmetic progressions, the partition numbers are always divisible by 5, 7, 11.
Nobody expected that.

---

## 2. His insane formula for ( \frac{1}{\pi} )

Ramanujan gave several rapidly converging series for ( \frac{1}{\pi} ).
Here’s a famous one:

```math
\frac{1}{\pi}
=
\frac{2\sqrt{2}}{9801}
\sum_{k=0}^{\infty}
\frac{
    (4k)!\,
    (1103 + 26390k)
}{
    (k!)^4 \,
    396^{4k}
}
```

This is not just pretty. It's useful:

* Each extra term of the sum gives a *lot* more correct digits of ( \pi ).
* This kind of series was used (decades later) in high-precision $\pi$ computations.

That "1103 + 26390k" and the "396" in the denominator are not random. That’s Ramanujan-level pattern vision.

---

## 3. Ramanujan’s continued fractions

A continued fraction is something like:

```math
a_0 + \frac{b_1}{a_1 + \frac{b_2}{a_2 + \frac{b_3}{a_3 + \cdots}}}
```

Ramanujan studied crazy ones that involve $q$-series.

One of his famous ones is the Rogers–Ramanujan continued fraction:

```math
R(q)
=
q^{1/5}
\;\bigg/\;
\left(
1
+ \frac{q}{1 + \frac{q^2}{1 + \frac{q^3}{1 + \cdots}}}
\right)
```

This object connects number theory, partitions, and modular forms.
It shows up in identities like:

```math
\frac{1}{R(q)}
- 1
- R(q)
=
\frac{1}{q^{1/5}}
\prod_{n=1}^{\infty}
\frac{(1 - q^{5n})}{(1 - q^{n})}
```

Those infinite products and continued fractions were in his notebooks, often with almost no proof.

---

## 4. Mock theta functions (late Ramanujan)

Near the end of his life he wrote about “mock theta functions,” which were mysterious at the time and only fully understood almost a century later.

One example of a mock theta function he gave:

```math
f(q)
=
1
+
\sum_{n=1}^{\infty}
\frac{q^{n^2}}{(1+q)^2 (1+q^2)^2 \cdots (1+q^n)^2}
```

He claimed these had deep modular-like behavior (transforming in special ways under ( q = e^{2\pi i \tau} ) with (\tau) in the upper half-plane).
Modern math: yes, they are connected to modular forms and harmonic Maass forms.

In other words, he guessed the shape of a theory that didn't fully exist yet.

---

## 5. A classic crazy-looking identity

This is a Ramanujan-style identity involving nested radicals:

```math
\sqrt{1 + 2\sqrt{1 + 3\sqrt{1 + 4\sqrt{1 + \cdots}}}}
= 3
```

That is:
If you keep going with the pattern ( \sqrt{1 + n\sqrt{1 + (n+1)\sqrt{1 + \cdots}}} ),
it converges in just the right way so that the value is exactly 3.
Stuff like this filled his notebooks: statements that look like magic tricks.

---

## 6. Bonus: rapidly converging arctangent-style series

Ramanujan also produced fast-converging expansions for constants. For example, for certain constants (A), he gave sums like:

```math
\frac{1}{\pi}
=
\sum_{k=0}^{\infty}
\frac{(a k + b)}{c^k} \binom{2k}{k}^2 \binom{4k}{2k}
```

Different choices of (a,b,c) give variants.
Same theme: factorials / binomials / huge denominators → extremely fast convergence.

These are the ancestors of "BBP-style" π formulas and modern high-precision arithmetic.
