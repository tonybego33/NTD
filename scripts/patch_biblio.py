#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Ajoute l'onglet « Fondements » (page Demarche et fondements scientifiques) au site.
- Cree un overlay #view-biblio calque sur la methodo (meme header, classe is-open).
- Ajoute openBiblio / closeBiblio dans frontend/js/intro.js.
- Transforme l'onglet mort « Indicateurs » en « Fondements » dans tous les headers.

Idempotent (skip si deja applique) + fail-safe (n'ecrit rien si une ancre manque).
Sauvegarde index.html.bak et intro.js.bak.

Lancer depuis la racine du repo :
    python3 scripts/patch_biblio.py
"""
import sys
from pathlib import Path

HTML = Path("frontend/index.html")
INTRO = Path("frontend/js/intro.js")

for f in (HTML, INTRO):
    if not f.exists():
        print(f"ERREUR : {f} introuvable. Lance le script depuis la racine du repo.")
        sys.exit(1)

html = HTML.read_text(encoding="utf-8")
intro = INTRO.read_text(encoding="utf-8")

if "view-biblio" in html or "openBiblio" in intro:
    print("Deja applique (view-biblio / openBiblio present). Rien a faire.")
    sys.exit(0)

# ─────────────────────────────────────────────────────────────────────────────
# 1) L'overlay biblio (insere juste avant l'overlay methodo)
# ─────────────────────────────────────────────────────────────────────────────
OVERLAY = r'''<div id="view-biblio">
  <style>
    #view-biblio{position:fixed;inset:0;z-index:1200;background:#eceeec;display:none;flex-direction:column;}
    #view-biblio.is-open{display:flex;}
    #view-biblio .biblio-scroll{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;}
    #view-biblio .biblio-wrap{max-width:820px;margin:0 auto;padding:54px 28px 110px;}
    #view-biblio .biblio-kicker{font:600 12px/1.4 'Manrope',system-ui,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#e2001a;margin:0 0 14px;}
    #view-biblio h1{font:700 34px/1.16 'Manrope',system-ui,sans-serif;color:#1a1a1a;margin:0 0 16px;letter-spacing:-.01em;}
    #view-biblio .biblio-lead{font:500 16px/1.6 'Manrope',system-ui,sans-serif;color:#55574f;margin:0;font-style:italic;}
    #view-biblio .biblio-rule{height:3px;width:54px;background:#e2001a;border-radius:2px;margin:28px 0 36px;}
    #view-biblio h2{font:700 22px/1.3 'Manrope',system-ui,sans-serif;color:#1a1a1a;margin:46px 0 10px;}
    #view-biblio h3{font:700 15px/1.4 'Manrope',system-ui,sans-serif;color:#e2001a;margin:26px 0 6px;}
    #view-biblio p{font:400 15.5px/1.72 'Manrope',system-ui,sans-serif;color:#33352f;margin:0 0 15px;}
    #view-biblio p strong{color:#1a1a1a;font-weight:700;}
    #view-biblio em{font-style:italic;}
    #view-biblio .biblio-claim{background:#fff;border:1px solid #e3e5e1;border-left:3px solid #e2001a;border-radius:12px;padding:16px 18px;margin:20px 0;font-weight:600;color:#1a1a1a;line-height:1.6;}
    #view-biblio blockquote{background:#f0f4ff;border:1px solid #c3d4f5;border-radius:12px;padding:15px 18px;margin:20px 0;font-style:italic;color:#33352f;line-height:1.6;}
    #view-biblio .biblio-refs p{font-size:13.5px;line-height:1.55;color:#55574f;margin:0 0 11px;padding-left:1.5em;text-indent:-1.5em;}
    #view-biblio .biblio-foot{margin-top:44px;padding-top:18px;border-top:1px solid #d8dbd8;font-size:13px;color:#6b6b6b;line-height:1.6;}
  </style>
  <header class="site-header methodo-siteheader">
    <div class="wrap site-header-inner">
      <a href="#" class="brand" onclick="closeBiblio(event)">
        <img src="/assets/arep-logo.png" alt="AREP" class="brand-arep" onerror="this.closest('.brand').classList.add('no-logo')">
        <span class="brand-arep-txt">AREP</span>
        <span class="brand-div"></span>
        <span class="brand-lockup">
          <span class="brand-name">Empreintes</span>
          <span class="brand-sub">Nos territoires décarbonés</span>
        </span>
      </a>
      <nav class="main-nav">
        <a href="#" class="nav-link" onclick="closeBiblio(event)">Diagnostic</a>
        <a href="#" class="nav-link" onclick="closeBiblio(event); openCartographie(event)">Cartographie</a>
        <a href="#" class="nav-link" onclick="closeBiblio(event); openMethodologie(event)">Méthodologie</a>
        <a href="#" class="nav-link is-active">Fondements</a>
        <a href="#" class="nav-link">Ressources</a>
      </nav>
      <div class="header-aux">
        <button class="header-replay" title="Rejouer l'intro" onclick="replayIntro()" aria-label="Rejouer l'intro">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
        </button>
      </div>
    </div>
  </header>
  <div class="biblio-scroll">
    <div class="biblio-wrap">
      <div class="biblio-kicker">Démarche scientifique</div>
      <h1>Démarche et fondements scientifiques</h1>
      <p class="biblio-lead">Pourquoi cet outil, ce qu'il mesure, ce qu'il refuse de faire, et la littérature sur laquelle il s'appuie.</p>
      <div class="biblio-rule"></div>

      <h2>Le propos de cette page</h2>
      <p>Un outil qui met un territoire en chiffres n'est jamais un simple miroir du réel. Il sélectionne, découpe, compare, hiérarchise. Chacune de ces opérations engage une vision du monde. Plutôt que de masquer ces choix derrière une fausse neutralité technique, cette page les expose : sur quelle hypothèse l'outil repose, quels travaux la fondent, où se situent ses limites, et pourquoi nous avons renoncé à certaines facilités (à commencer par la note unique qui classerait les territoires les uns contre les autres).</p>
      <p class="biblio-claim">La forme et l'organisation d'un territoire pèsent lourdement sur sa dépendance à l'automobile et sur son empreinte carbone, sans pour autant la déterminer mécaniquement ; et parce que mesurer n'est jamais un acte neutre, l'outil objective pour éclairer la décision, tout en refusant de réduire un territoire à un score.</p>
      <p>Cette position est double. Elle porte une thèse sur les territoires (la forme compte), et une thèse réflexive sur l'instrument lui-même (quantifier transforme ce que l'on quantifie). Les deux sont indissociables : c'est ce qui sépare un tableau de bord d'une démarche.</p>

      <h2>1. Ce que dit la littérature : la forme urbaine conditionne la mobilité</h2>
      <h3>L'intuition fondatrice</h3>
      <p>Le projet est né d'une observation de terrain à La Rochelle : là où une part importante de l'habitat et des équipements du quotidien se situe à faible distance d'une école élémentaire, on observe de meilleures performances environnementales et un recours plus fréquent aux modes actifs. L'enjeu de l'outil a été de transformer cette intuition locale en un cadre d'analyse reproductible et discutable, applicable à n'importe quel territoire français à partir de données publiques.</p>
      <h3>La co-production de la ville et de l'automobile</h3>
      <p>Le socle théorique est posé par Marc Wiel. Dans <em>La transition urbaine</em> (1999) puis <em>Ville et automobile</em> (2002), il montre que l'automobile et l'étalement urbain se co-produisent : la vitesse permise par la voiture a étiré les distances, qui à leur tour ont rendu la voiture indispensable. La dépendance automobile n'est donc pas qu'une affaire de comportements individuels, c'est une propriété de la forme urbaine héritée de décennies d'aménagement. C'est précisément ce lien que l'outil cherche à objectiver.</p>
      <p>À l'échelle internationale, les travaux de Newman et Kenworthy (<em>Cities and Automobile Dependence</em>, 1989) ont popularisé la relation entre densité urbaine et consommation de carburant : les villes denses consomment structurellement moins par habitant que les villes étalées. Nous mobilisons cette référence comme un appui, non comme une preuve : sa portée a été discutée (la corrélation n'établit pas la causalité, les effets de composition et d'échelle sont importants). Elle indique une tendance robuste, pas une loi.</p>
      <p>Le mécanisme qui relie vitesse et étalement est éclairé par la notion de budget-temps de transport constant (Zahavi, Marchetti) : en moyenne, le temps quotidien consacré aux déplacements reste stable autour d'une heure. Gagner en vitesse ne fait donc pas gagner du temps, cela fait parcourir plus de distance. La voiture n'a pas rapproché les lieux, elle a éloigné les destinations.</p>
      <h3>Du périurbain à la proximité</h3>
      <p>Éric Charmes (<em>La ville émiettée</em>, 2011) apporte la lecture sociologique du périurbain : un tissu fragmenté, organisé autour de logiques d'entre-soi communal, dans lequel la dépendance automobile n'est pas un accident mais une condition de fonctionnement. Cette grille est essentielle pour interpréter nos terrains, qui associent des coeurs d'agglomération denses et des couronnes périurbaines étendues.</p>
      <p>Frédéric Héran opère le pivot vers ce qui est devenu le coeur de notre approche : la proximité et l'accès aux équipements. Dans <em>Le retour de la bicyclette</em> (2014) et <em>La ville morcelée</em> (2011), il montre comment l'emprise automobile a détruit la proximité, par effet de coupure et par éviction de la marche et du vélo. Ce déplacement de focale est décisif pour nous : la dépendance automobile n'est plus seulement le sujet, elle devient la conséquence d'une organisation spatiale qui éloigne ou rapproche le quotidien. C'est pourquoi l'outil mesure d'abord l'accès aux équipements et la compacité, et lit la voiture comme un symptôme.</p>
      <p>Cette entrée par la proximité rejoint le débat contemporain sur la ville du quart d'heure (Moreno, 2020), que nous mobilisons avec recul : non comme un slogan, mais comme une manière d'opérationnaliser une question ancienne, celle de la distance au quotidien. Le choix de l'école élémentaire comme point d'ancrage de la mesure procède de cette logique : c'est le marqueur de centralité le plus universel et le mieux réparti sur le territoire, présent jusque dans les petites communes.</p>

      <h2>2. Les garde-fous : pourquoi nous refusons le déterminisme</h2>
      <p>Affirmer que la forme conditionne la mobilité expose à un risque : le déterminisme spatial, l'idée naïve que la géométrie d'un territoire suffirait à expliquer les comportements. Deux corps de travaux nous en préservent.</p>
      <p>Jean-Marc Offner, dans un article devenu classique (« Les effets structurants du transport : mythe politique, mystification scientifique », 1993), démonte l'idée que l'aménagement ou l'offre de transport structureraient mécaniquement les territoires. Les relations entre forme et usages sont des congruences, des effets de système, jamais des causalités simples et univoques. Nous reprenons cette prudence à notre compte : l'outil met en évidence des associations, il ne démontre pas des chaînes de causes.</p>
      <p>Vincent Kaufmann, avec la notion de motilité (Kaufmann et al., 2004 ; <em>Les paradoxes de la mobilité</em>, 2008), rappelle que la mobilité dépend aussi des dispositions, des compétences et des aspirations des individus, c'est-à-dire d'un capital socialement distribué, et pas seulement de la configuration des lieux. Un même territoire ne produit pas les mêmes mobilités pour tous ceux qui l'habitent.</p>
      <p>La conséquence pour notre discours est claire. Nous parlons de <strong>contrainte structurelle</strong>, jamais de <strong>fatalité</strong>. La forme rend certains usages probables et d'autres coûteux, elle n'impose rien de façon absolue.</p>
      <blockquote>L'usage généralisé de la voiture relève moins d'une fatalité que d'une gouvernance des territoires et d'habitudes culturelles. (formule de Fabien Rosa qui guide le projet)</blockquote>

      <h2>3. La réflexivité : un instrument de mesure n'est jamais neutre</h2>
      <p>C'est ici que notre démarche se distingue d'un simple outil de visualisation. Quantifier un territoire est un acte qui transforme la façon dont on le perçoit et dont on le gouverne. La sociologie des instruments et de la quantification nous donne les moyens de penser ce que notre propre outil produit.</p>
      <p>Pierre Lascoumes et Patrick Le Galès (<em>Gouverner par les instruments</em>, 2004) posent le cadre : un instrument d'action publique n'est jamais une technique neutre au service d'une fin extérieure. Il porte une théorie implicite du social, il sélectionne ce qui compte, et il produit ses propres effets sur la réalité qu'il prétend décrire. Notre outil est un tel instrument, et nous l'assumons comme tel.</p>
      <p>Alain Desrosières (<em>La politique des grands nombres</em>, 1993 ; <em>Pour une sociologie historique de la quantification</em>, 2008) montre que mesurer suppose d'abord de <strong>convenir</strong> : définir des conventions d'équivalence avant de pouvoir compter. La statistique ne se contente pas de décrire le réel, elle le met en forme. Chaque indicateur que nous affichons résulte ainsi d'un accord préalable (que retient-on comme équipement essentiel, à quelle distance fixe-t-on le seuil de proximité, à quelle maille agrège-t-on) qui mérite d'être explicité plutôt que naturalisé.</p>
      <p>Wendy Espeland et Mitchell Stevens (« Commensuration as a Social Process », 1998) analysent la commensuration, c'est-à-dire le fait de ramener des grandeurs hétérogènes à une même échelle. C'est un acte social puissant : il rend des choses comparables qui ne l'étaient pas, et ce faisant il efface ce qui les distinguait. <strong>C'est la justification théorique directe de notre refus du score global</strong> : agréger des émissions, de l'habitat, de la mobilité et du revenu en une note unique reviendrait à commensurer l'incommensurable, en masquant sous un chiffre les arbitrages qui l'ont produit.</p>
      <p>Isabelle Bruno et Emmanuel Didier (<em>Benchmarking</em>, 2013) décrivent comment le classement comparatif est devenu une technique de gouvernement, mettant les acteurs sous pression par le palmarès. Notre outil compare les territoires, et nous devons donc nous situer : nous comparons chaque territoire à ses pairs de même densité non pour le classer dans un palmarès, mais pour le contextualiser, parce qu'un territoire dense et un territoire rural ne se jugent pas à la même aune.</p>
      <p>Enfin, Theodore Porter (<em>Trust in Numbers</em>, 1995) et Sally Engle Merry (<em>The Seduction of Quantification</em>, 2016) éclairent la force de conviction propre aux chiffres : ils rassurent, ils paraissent objectifs, et c'est précisément ce qui les rend séduisants et potentiellement trompeurs. Cette lucidité fonde notre exigence de transparence sur le statut de chaque donnée.</p>

      <h2>4. De la littérature aux choix de l'outil</h2>
      <p>Ces références ne sont pas un décor savant. Chacune se traduit en une décision concrète dans la conception de l'outil.</p>
      <p><strong>Pas de score global, mais une lecture indicateur par indicateur.</strong> C'est notre application directe d'Espeland et Stevens : nous refusons la commensuration totale qui dissoudrait la richesse du diagnostic dans une note. Le lecteur garde sous les yeux des grandeurs distinctes, qu'il met lui-même en relation.</p>
      <p><strong>Une comparaison aux pairs de densité, pas un palmarès.</strong> Suivant Bruno et Didier, nous échappons au benchmarking naïf en contextualisant : le positionnement se fait au sein d'une même typologie de territoires (grille de densité INSEE), par rang relatif, et non sur une échelle absolue unique.</p>
      <p><strong>Des statuts de donnée affichés.</strong> Chaque indicateur porte la mention de sa fiabilité et de son origine. C'est notre réponse à Porter et Desrosières : rendre visible la convention et l'incertitude, au lieu de laisser le chiffre imposer sa fausse évidence.</p>
      <p><strong>Un ancrage sur la proximité.</strong> L'indicateur de compacité (part de l'habitat et des équipements à moins de 1,5 kilomètre d'une école élémentaire) est l'opérationnalisation de la lecture de Héran : mesurer si le quotidien est à portée de marche.</p>
      <p><strong>Une sobriété assumée.</strong> L'outil est volontairement léger (architecture frugale, données ouvertes non dupliquées). Cette sobriété fait écho aux travaux de Philippe Bihouix (<em>L'Âge des low tech</em>, 2014 ; <em>La ville stationnaire</em>, 2022) : un outil ne décarbone rien par lui-même, il éclaire des choix d'aménagement qui, eux, évitent ou produisent du carbone. La vraie sobriété est dans la décision, pas dans l'instrument. Nos indicateurs d'artificialisation et de compacité sont d'ailleurs une mise en chiffres directe de la ville stationnaire : réinvestir l'existant plutôt qu'étaler.</p>

      <h2>5. Les limites que nous assumons</h2>
      <p>La rigueur scientifique se mesure aussi à la franchise sur ce que l'outil ne fait pas.</p>
      <p><strong>Deux mailles, deux récits.</strong> Les indicateurs sont disponibles à la commune et à l'EPCI. Un même territoire ne raconte pas la même chose selon l'échelle : le coeur urbain de La Rochelle apparaît bien plus compact que sa communauté d'agglomération, qui intègre des communes périurbaines. Ce n'est pas une erreur, c'est un effet d'échelle, et nous le signalons.</p>
      <p><strong>La mobilité est partielle.</strong> Les parts modales proviennent des données de déplacements domicile-travail (INSEE MOBPRO). Elles ne couvrent ni les achats, ni les loisirs, ni les déplacements scolaires, qui composent l'essentiel de la mobilité quotidienne. C'est une approximation, à compléter.</p>
      <p><strong>Des indicateurs encore en attente.</strong> Certaines dimensions importantes (aménagements cyclables, engagement effectif des collectivités, densité fine de la tache urbaine) ne disposent pas encore de sources ouvertes fiables et homogènes. Elles sont signalées comme telles.</p>
      <p><strong>Des scores relatifs, jamais absolus.</strong> L'outil situe, il ne décerne pas de verdict. Il est un point de départ pour la discussion et l'analyse, pas son point d'arrivée.</p>
      <p>En somme, l'outil objective sans prétendre trancher. Il rend visible une question (la forme d'un territoire et le rapport qu'elle induit à la voiture et au carbone) et donne aux acteurs de quoi en débattre sur une base commune et explicite. C'est, nous semble-t-il, la juste place d'un instrument : aider à penser, pas penser à la place.</p>

      <h2>Bibliographie</h2>
      <div class="biblio-refs">
        <p>Bihouix, P. (2014). <em>L'Âge des low tech. Vers une civilisation techniquement soutenable</em>. Paris : Seuil.</p>
        <p>Bihouix, P., Jeantet, S. et De Selva, C. (2022). <em>La ville stationnaire. Comment mettre fin à l'étalement urbain</em>. Arles : Actes Sud.</p>
        <p>Bruno, I. et Didier, E. (2013). <em>Benchmarking. L'État sous pression statistique</em>. Paris : La Découverte.</p>
        <p>Charmes, É. (2011). <em>La ville émiettée. Essai sur la clubbisation de la vie urbaine</em>. Paris : PUF.</p>
        <p>Desrosières, A. (1993). <em>La politique des grands nombres. Histoire de la raison statistique</em>. Paris : La Découverte.</p>
        <p>Desrosières, A. (2008). <em>Pour une sociologie historique de la quantification</em>. Paris : Presses des Mines.</p>
        <p>Espeland, W. N. et Stevens, M. L. (1998). « Commensuration as a Social Process ». <em>Annual Review of Sociology</em>, 24, 313-343.</p>
        <p>Héran, F. (2011). <em>La ville morcelée. Effets de coupure en milieu urbain</em>. Paris : Economica.</p>
        <p>Héran, F. (2014). <em>Le retour de la bicyclette. Une histoire des déplacements urbains en Europe, de 1817 à 2050</em>. Paris : La Découverte.</p>
        <p>Kaufmann, V., Bergman, M. et Joye, D. (2004). « Motility : Mobility as Capital ». <em>International Journal of Urban and Regional Research</em>, 28(4), 745-756.</p>
        <p>Kaufmann, V. (2008). <em>Les paradoxes de la mobilité. Bouger, s'enraciner</em>. Lausanne : Presses polytechniques et universitaires romandes.</p>
        <p>Lascoumes, P. et Le Galès, P. (dir.) (2004). <em>Gouverner par les instruments</em>. Paris : Presses de Sciences Po.</p>
        <p>Marchetti, C. (1994). « Anthropological Invariants in Travel Behavior ». <em>Technological Forecasting and Social Change</em>, 47(1), 75-88.</p>
        <p>Merry, S. E. (2016). <em>The Seduction of Quantification. Measuring Human Rights, Gender Violence, and Sex Trafficking</em>. Chicago : University of Chicago Press.</p>
        <p>Moreno, C. (2020). <em>Droit de cité. De la « ville-monde » à la « ville du quart d'heure »</em>. Paris : Éditions de l'Observatoire.</p>
        <p>Newman, P. et Kenworthy, J. (1989). <em>Cities and Automobile Dependence: An International Sourcebook</em>. Aldershot : Gower.</p>
        <p>Offner, J.-M. (1993). « Les effets structurants du transport : mythe politique, mystification scientifique ». <em>L'Espace géographique</em>, 22(3), 233-242.</p>
        <p>Porter, T. M. (1995). <em>Trust in Numbers. The Pursuit of Objectivity in Science and Public Life</em>. Princeton : Princeton University Press.</p>
        <p>Wiel, M. (1999). <em>La transition urbaine ou le passage de la ville pédestre à la ville motorisée</em>. Sprimont : Mardaga.</p>
        <p>Wiel, M. (2002). <em>Ville et automobile</em>. Paris : Descartes &amp; Cie.</p>
      </div>

      <div class="biblio-foot">Empreintes / Nos territoires décarbonés &middot; GT BDDe &middot; AREP (filiale SNCF Gares &amp; Connexions)</div>
    </div>
  </div>
</div>
'''

# ─────────────────────────────────────────────────────────────────────────────
# 2) Les fonctions openBiblio / closeBiblio (intro.js)
# ─────────────────────────────────────────────────────────────────────────────
JS = '''function openBiblio(e) {
  e?.preventDefault();
  if (typeof closeMethodologie === 'function') closeMethodologie();
  if (typeof closeCartographie === 'function') closeCartographie();
  const overlay = document.getElementById('view-biblio');
  if (!overlay) return;
  overlay.classList.add('is-open');
  document.body.style.overflow = 'hidden';
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('is-active'));
  e?.currentTarget?.classList?.add('is-active');
  overlay.querySelector('.biblio-scroll')?.scrollTo(0, 0);
}

function closeBiblio(e) {
  e?.preventDefault();
  const overlay = document.getElementById('view-biblio');
  if (!overlay) return;
  overlay.classList.remove('is-open');
  document.body.style.overflow = '';
  document.querySelectorAll('.nav-link').forEach((l, i) => l.classList.toggle('is-active', i === 0));
}

'''

# ─────────────────────────────────────────────────────────────────────────────
# Verification des ancres (fail-safe)
# ─────────────────────────────────────────────────────────────────────────────
ANCHOR_OVERLAY = '<div id="view-methodologie">'
ANCHOR_NAV = '<a href="#" class="nav-link">Indicateurs</a>'
ANCHOR_JS = 'function setupMethodoScrollSpy() {'

problemes = []
if html.count(ANCHOR_OVERLAY) != 1:
    problemes.append(f"  index.html : ancre overlay '{ANCHOR_OVERLAY}' trouvee {html.count(ANCHOR_OVERLAY)} fois (attendu 1)")
if ANCHOR_NAV not in html:
    problemes.append(f"  index.html : lien de nav '{ANCHOR_NAV}' introuvable")
if ANCHOR_JS not in intro:
    problemes.append(f"  intro.js : ancre '{ANCHOR_JS}' introuvable")

if problemes:
    print("Patch NON applique. Ancres a verifier :")
    print("\n".join(problemes))
    print("\nRien n'a ete modifie.")
    sys.exit(1)

# ─────────────────────────────────────────────────────────────────────────────
# Application
# ─────────────────────────────────────────────────────────────────────────────
HTML.with_suffix(".html.bak").write_text(html, encoding="utf-8")
INTRO.with_suffix(".js.bak").write_text(intro, encoding="utf-8")

# a) overlay biblio insere juste avant l'overlay methodo
html = html.replace(ANCHOR_OVERLAY, OVERLAY + "\n" + ANCHOR_OVERLAY, 1)
# b) onglet mort « Indicateurs » -> « Fondements » dans tous les headers
n_nav = html.count(ANCHOR_NAV)
html = html.replace(ANCHOR_NAV, '<a href="#" class="nav-link" onclick="openBiblio(event)">Fondements</a>')
# c) fonctions openBiblio / closeBiblio avant le scrollspy methodo
intro = intro.replace(ANCHOR_JS, JS + ANCHOR_JS, 1)

HTML.write_text(html, encoding="utf-8")
INTRO.write_text(intro, encoding="utf-8")

print("OK : onglet Fondements ajoute.")
print(f"  - overlay #view-biblio insere dans index.html")
print(f"  - onglet « Indicateurs » -> « Fondements » sur {n_nav} header(s)")
print(f"  - openBiblio / closeBiblio ajoutes dans intro.js")
print("Sauvegardes : frontend/index.html.bak  et  frontend/js/intro.js.bak")
print("\nVerifie :  node --check frontend/js/intro.js")
print("Puis Ctrl+Shift+R, et clique l'onglet Fondements.")
