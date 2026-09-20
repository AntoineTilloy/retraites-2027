# Microsimulation simplifiée : assiette des pensions par taux de CSG, pour calibrer P.csg.mdParPointTaux66 dans params.js.
# Réutilise la distribution de pensions et les règles de outils/simulation-plafond.py. Lancer : python3 outils/simulation-csg.py
# Limites : le RFR simulé ne contient que les pensions (pas de revenus du patrimoine), ce qui surestime la part des exonérés
# (41 % simulés contre 29 % observés au régime général) et sous-estime le taux plein. Le coût total des taux réduits
# ressort à ~9,7 Md€, cohérent avec l'ordre de grandeur de 9 Md€ cité dans le débat.
import os, numpy as np
src = open(os.path.join(os.path.dirname(__file__), 'simulation-plafond.py')).read().split('res = {}')[0]
exec(src)

def rates(pensions, parts):
    brut = sum(p * 12 for p in pensions); nb = len(pensions)
    rate = np.full_like(brut, 8.3)
    for _ in range(3):
        dd = np.select([rate == 0, rate == 3.8, rate == 6.6], [0, 3.8, 4.2], 5.9)
        imp = brut * (1 - dd / 100)
        ab = np.minimum(np.maximum(imp * 0.1, 463 * nb), 4528)
        rng_ = imp - ab
        a65 = np.where(rng_ <= 18023, 2878 * nb, np.where(rng_ <= 28999, 1439 * nb, 0))
        rfr = np.maximum(0, rng_ - a65)
        s = seuils[parts]
        rate = np.select([rfr <= s[0], rfr <= s[1], rfr <= s[2]], [0, 3.8, 6.6], 8.3)
    return brut, rate

b1, r1 = rates([p1, p2], 2); b2, r2 = rates([ps], 1)
brut = np.concatenate([b1, b2]); rate = np.concatenate([r1, r2])
npers = np.concatenate([np.full(len(b1), 2), np.full(len(b2), 1)])
print("assiette totale simulée (Md€) :", round(brut.sum() * weight / 1e9, 1))
for t in [0, 3.8, 6.6, 8.3]:
    m = rate == t
    print(f"taux {t:>4} : {npers[m].sum() / npers.sum() * 100:4.1f} % des retraités, assiette {brut[m].sum() * weight / 1e9:6.1f} Md€")
a66 = brut[rate == 6.6].sum() * weight / 1e9
print("rendement 6,6 -> 8,3 :", round(a66 * 0.017, 2), "Md€ ; 6,6 -> 9,2 :", round(a66 * 0.026, 2))
print("coût des taux réduits par rapport au taux plein (CSG seule) :",
      round((brut[rate == 0].sum() * 0.083 + brut[rate == 3.8].sum() * 0.045 + brut[rate == 6.6].sum() * 0.017) * weight / 1e9, 1))
