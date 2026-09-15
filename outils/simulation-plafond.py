# Microsimulation simplifiée du rendement d'un abaissement du plafond de l'abattement de 10 %.
# Sert à calibrer P.abatt.gains dans params.js. Lancer : python3 outils/simulation-plafond.py (numpy requis).
# Hypothèses : pensions individuelles lognormales (médiane 1 450 €, moyenne ~1 730 €, D9 ~3 100 €, calées sur la DREES),
# 45 % des retraités en couple de deux retraités, barème 2027 estimé, abattement des plus de 65 ans, décote, taux de CSG par RFR.
# Résultat normalisé pour que la suppression totale rapporte 5,5 Md€ (fourchette des sources : 4,5 à 5,7).
import numpy as np
rng = np.random.default_rng(1)
N_RET = 16.4e6; PART_COUPLE = 0.45
n = 400_000
# pensions individuelles brutes mensuelles : lognormale calée sur la DREES (médiane ~1 450, moyenne ~1 700, D9 ~3 100)
def draw(k, corr=None):
    z = rng.standard_normal(k)
    if corr is not None: z = corr[0]*z + np.sqrt(1-corr[0]**2)*corr[1]
    return 1450*np.exp(0.6*z)
n_c = int(n*PART_COUPLE/2); n_s = n - 2*n_c
z1 = rng.standard_normal(n_c); p1 = 1450*np.exp(0.6*z1)
z2 = 0.35*z1 + np.sqrt(1-0.35**2)*rng.standard_normal(n_c); p2 = 1450*np.exp(0.6*z2)
ps = 1450*np.exp(0.6*rng.standard_normal(n_s))
weight = N_RET / n   # chaque tirage représente ce nombre de retraités
tr = [(11832,0),(30091,.11),(86269,.30),(185555,.41),(1e12,.45)]
seuils = {1:[13165,17211,26710], 2:[20196,26402,40969]}
ded = {0:0,3.8:3.8,6.6:4.2,8.3:5.9}
def impot(rni, parts):
    q = np.maximum(rni,0)/parts; ir = np.zeros_like(q); prev=0
    for lim,t in tr:
        ir += np.clip(q-prev,0,lim-prev)*t; prev=lim
    ir *= parts
    d = (1513,3344) if parts==2 else (915,2022)
    dec = np.maximum(0, d[0]-0.4525*ir)
    ir = np.where(ir<d[1], np.maximum(0, ir-dec), ir)
    return ir
def ir_foyer(pensions, parts, plafond, minimum=463):
    brut = sum(p*12 for p in pensions)
    nb = len(pensions)
    # taux CSG via RFR (itération)
    rate = np.full_like(brut, 8.3)
    for _ in range(3):
        dd = np.select([rate==0,rate==3.8,rate==6.6],[0,3.8,4.2],5.9)
        imp = brut*(1-dd/100)
        ab = np.minimum(np.maximum(imp*0.1, minimum*nb), 4528)
        rng_ = imp-ab
        a65 = np.where(rng_<=18023, 2878*nb, np.where(rng_<=28999, 1439*nb, 0))
        rfr = np.maximum(0, rng_-a65)
        s = seuils[parts]
        rate = np.select([rfr<=s[0], rfr<=s[1], rfr<=s[2]],[0,3.8,6.6],8.3)
    dd = np.select([rate==0,rate==3.8,rate==6.6],[0,3.8,4.2],5.9)
    imp = brut*(1-dd/100)
    ab = np.minimum(np.maximum(imp*0.1, minimum*nb), plafond) if plafond>0 else np.zeros_like(imp)
    rng_ = imp-ab
    a65 = np.where(rng_<=18023, 2878*nb, np.where(rng_<=28999, 1439*nb, 0))
    rni = np.maximum(0, rng_-a65)
    ir = impot(rni, parts)
    return np.where(ir<61, 0, ir)
res = {}
for plaf in [4528, 3000, 2000, 1000, 0]:
    tot = (ir_foyer([p1,p2],2,plaf).sum() + ir_foyer([ps],1,plaf).sum())*weight/1e9
    res[plaf]=tot
base = res[4528]
print("IR total des retraités (Md€) :", round(base,1))
for plaf in [3000,2000,1000,0]:
    g = res[plaf]-base
    print(f"plafond {plaf:>5} : +{g:.2f} Md€ brut ; normalisé sur 5,5 = {g/(res[0]-base)*5.5:.2f}")
imp = (ir_foyer([p1,p2],2,4528)>0).mean(), (ir_foyer([ps],1,4528)>0).mean()
print("part de foyers imposables couples / seuls :", [round(x,2) for x in imp])
print("pension moyenne simulée :", round(np.concatenate([p1,p2,ps]).mean()), "médiane", round(np.median(np.concatenate([p1,p2,ps]))))
