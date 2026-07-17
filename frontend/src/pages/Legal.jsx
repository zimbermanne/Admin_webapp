import { useState } from 'react'
import { Link } from 'react-router-dom'

const CONTENT = {
  en: {
    label: 'English',
    title: 'Terms of Use & Disclaimer',
    updated: 'Last updated: July 2026',
    sections: [
      {
        h: '1. Acceptance of Terms',
        p: [
          'These Terms of Use and Disclaimer ("Terms") govern access to and use of the Moneytracer application, website, and related services (collectively, the "Service"), operated by Zimbermanne Company Limited, trading as Zimbermanne Studios ("the Company", "we", "us", or "our"). By creating an account, downloading the application, or otherwise accessing the Service, the person or entity so acting ("User", "you") agrees to be bound by these Terms in their entirety.',
        ],
      },
      {
        h: '2. Beta / Development Status',
        p: [
          'The Service is currently offered in a pre-general-availability, active development phase ("Beta Phase"). During the Beta Phase, the Company may modify, suspend, or discontinue any feature of the Service at any time without prior notice, and the Service is provided free of charge for an introductory period of ninety (90) days from the date of the User\'s first account creation, subject to change at the Company\'s sole discretion.',
          'The User acknowledges that software in active development is inherently subject to defects, interruptions, and behavioral changes, and that continued use of the Service during the Beta Phase is undertaken with full knowledge of this status.',
        ],
      },
      {
        h: '3. No Warranty',
        p: [
          'THE SERVICE IS PROVIDED ON AN "AS IS" AND "AS AVAILABLE" BASIS, WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS, IMPLIED, STATUTORY, OR OTHERWISE, INCLUDING WITHOUT LIMITATION ANY IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, NON-INFRINGEMENT, OR ACCURACY OF DATA. THE COMPANY DOES NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, TIMELY, SECURE, OR ERROR-FREE, OR THAT DEFECTS WILL BE CORRECTED.',
        ],
      },
      {
        h: '4. Data Loss and Integrity',
        p: [
          'The Company shall not be liable, under any theory of liability, for any loss, corruption, deletion, or unauthorized alteration of data — including without limitation financial records, transaction histories, inventory data, or account information — arising from use of the Service during the Beta Phase or otherwise. The User is solely responsible for maintaining independent backups or exports of any information the User considers critical, using the export functionality made available within the Service.',
        ],
      },
      {
        h: '5. Not Professional Advice',
        p: [
          'The Service is a record-keeping and organizational tool and does not constitute, and shall not be construed as, accounting, tax, legal, or financial advisory services. Nothing produced, calculated, or displayed by the Service should be relied upon as a substitute for advice from a duly qualified professional. Users engaged in group or community financial arrangements (including but not limited to savings groups, cooperatives, or "Vikoba"-type structures) remain solely responsible for reconciling and verifying records independently of the Service.',
        ],
      },
      {
        h: '6. Limitation of Liability',
        p: [
          'TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL THE COMPANY, ITS FOUNDERS, DIRECTORS, OFFICERS, EMPLOYEES, CONTRACTORS, OR AFFILIATES BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, REVENUE, DATA, OR GOODWILL, ARISING OUT OF OR RELATED TO THE USER\'S ACCESS TO OR USE OF (OR INABILITY TO ACCESS OR USE) THE SERVICE, REGARDLESS OF THE LEGAL THEORY ON WHICH SUCH DAMAGES ARE BASED AND EVEN IF THE COMPANY HAS BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES. IN ANY EVENT, THE COMPANY\'S AGGREGATE LIABILITY ARISING OUT OF OR RELATING TO THESE TERMS OR THE SERVICE SHALL NOT EXCEED THE GREATER OF (A) THE TOTAL AMOUNT PAID BY THE USER TO THE COMPANY IN THE TWELVE (12) MONTHS PRECEDING THE EVENT GIVING RISE TO THE CLAIM, OR (B) ZERO, GIVEN THE SERVICE IS CURRENTLY PROVIDED FREE OF CHARGE.',
        ],
      },
      {
        h: '7. Indemnification',
        p: [
          'The User agrees to indemnify, defend, and hold harmless the Company and its founders, officers, and affiliates from and against any claims, liabilities, damages, losses, and expenses, including reasonable legal fees, arising out of or in any way connected with the User\'s access to or use of the Service, the User\'s violation of these Terms, or the User\'s violation of any rights of a third party.',
        ],
      },
      {
        h: '8. Governing Law and Dispute Resolution',
        p: [
          'These Terms shall be governed by and construed in accordance with the laws of the United Republic of Tanzania, without regard to conflict-of-law principles. Any dispute arising out of or relating to these Terms or the Service shall first be submitted to good-faith negotiation between the parties; failing resolution within thirty (30) days, either party may pursue the matter before a competent court of Tanzania, or, at the Company\'s election, through arbitration seated in Tanzania under rules the Company may designate from time to time.',
        ],
      },
      {
        h: '9. Force Majeure',
        p: [
          'The Company shall not be liable for any failure or delay in performance resulting from causes beyond its reasonable control, including but not limited to power or internet infrastructure failures, acts of government, natural disasters, or third-party hosting or platform outages (including those of underlying cloud or deployment providers).',
        ],
      },
      {
        h: '10. Severability and Amendment',
        p: [
          'If any provision of these Terms is held to be unenforceable or invalid, such provision shall be limited or eliminated to the minimum extent necessary so that the remaining Terms shall otherwise remain in full force and effect. The Company reserves the right to amend these Terms at any time; continued use of the Service following such amendment constitutes acceptance of the revised Terms.',
        ],
      },
      {
        h: '11. Language',
        p: [
          'These Terms are made available in multiple languages for the convenience of Users across different regions. In the event of any conflict or inconsistency between language versions, the English version shall prevail and govern for interpretation purposes, unless otherwise required by applicable local law.',
        ],
      },
    ],
    footerNote: 'This document is a general-purpose Terms of Use and Disclaimer template. It is provided for informational structuring purposes and should be reviewed by a qualified attorney licensed in each jurisdiction of operation before formal reliance.',
  },

  fr: {
    label: 'Français',
    title: "Conditions d'utilisation et clause de non-responsabilité",
    updated: 'Dernière mise à jour : juillet 2026',
    sections: [
      {
        h: "1. Acceptation des conditions",
        p: [
          'Les présentes Conditions d\'utilisation et clause de non-responsabilité (les « Conditions ») régissent l\'accès et l\'utilisation de l\'application, du site web et des services connexes Moneytracer (collectivement, le « Service »), exploités par Zimbermanne Company Limited, opérant sous le nom de Zimbermanne Studios (« la Société », « nous »). En créant un compte, en téléchargeant l\'application ou en accédant autrement au Service, la personne ou l\'entité concernée (« Utilisateur », « vous ») accepte d\'être liée par ces Conditions dans leur intégralité.',
        ],
      },
      {
        h: '2. Statut Bêta / En développement',
        p: [
          'Le Service est actuellement proposé dans une phase de développement actif préalable à la disponibilité générale (« Phase Bêta »). Pendant cette phase, la Société peut modifier, suspendre ou interrompre toute fonctionnalité du Service à tout moment sans préavis, et le Service est fourni gratuitement pendant une période initiale de quatre-vingt-dix (90) jours à compter de la création du compte de l\'Utilisateur, sous réserve de modification à la seule discrétion de la Société.',
          'L\'Utilisateur reconnaît qu\'un logiciel en développement actif est par nature sujet à des défauts, interruptions et changements de comportement, et que l\'utilisation continue du Service pendant la Phase Bêta est entreprise en toute connaissance de ce statut.',
        ],
      },
      {
        h: '3. Absence de garantie',
        p: [
          'LE SERVICE EST FOURNI « EN L\'ÉTAT » ET « SELON DISPONIBILITÉ », SANS GARANTIE D\'AUCUNE SORTE, EXPRESSE, IMPLICITE, LÉGALE OU AUTRE, Y COMPRIS SANS LIMITATION TOUTE GARANTIE IMPLICITE DE QUALITÉ MARCHANDE, D\'ADÉQUATION À UN USAGE PARTICULIER, DE TITRE DE PROPRIÉTÉ, DE NON-CONTREFAÇON OU D\'EXACTITUDE DES DONNÉES.',
        ],
      },
      {
        h: '4. Perte et intégrité des données',
        p: [
          'La Société ne pourra être tenue responsable, quel que soit le fondement juridique invoqué, de toute perte, corruption, suppression ou altération non autorisée de données — y compris, sans limitation, les registres financiers, historiques de transactions, données d\'inventaire ou informations de compte — résultant de l\'utilisation du Service pendant la Phase Bêta ou autrement. L\'Utilisateur est seul responsable du maintien de sauvegardes ou exports indépendants de toute information qu\'il considère comme critique.',
        ],
      },
      {
        h: '5. Absence de conseil professionnel',
        p: [
          'Le Service est un outil de tenue de registres et d\'organisation et ne constitue pas, et ne doit pas être interprété comme, un service de conseil comptable, fiscal, juridique ou financier. Les utilisateurs engagés dans des arrangements financiers collectifs (y compris les groupes d\'épargne ou structures de type « Vikoba ») demeurent seuls responsables de la vérification indépendante de leurs registres.',
        ],
      },
      {
        h: '6. Limitation de responsabilité',
        p: [
          'DANS TOUTE LA MESURE PERMISE PAR LA LOI APPLICABLE, EN AUCUN CAS LA SOCIÉTÉ, SES FONDATEURS, DIRIGEANTS, EMPLOYÉS OU AFFILIÉS NE SERONT RESPONSABLES DE DOMMAGES INDIRECTS, ACCESSOIRES, SPÉCIAUX, CONSÉCUTIFS OU PUNITIFS, NI DE TOUTE PERTE DE PROFITS, DE REVENUS, DE DONNÉES OU DE CLIENTÈLE. LA RESPONSABILITÉ GLOBALE DE LA SOCIÉTÉ NE POURRA EXCÉDER LE MONTANT LE PLUS ÉLEVÉ ENTRE (A) LE TOTAL PAYÉ PAR L\'UTILISATEUR AU COURS DES DOUZE (12) DERNIERS MOIS, OU (B) ZÉRO, LE SERVICE ÉTANT ACTUELLEMENT GRATUIT.',
        ],
      },
      {
        h: '7. Indemnisation',
        p: [
          'L\'Utilisateur accepte d\'indemniser et de dégager de toute responsabilité la Société et ses fondateurs, dirigeants et affiliés contre toute réclamation, responsabilité, dommage, perte et dépense, y compris les frais juridiques raisonnables, découlant de l\'accès ou de l\'utilisation du Service par l\'Utilisateur, ou de sa violation des présentes Conditions.',
        ],
      },
      {
        h: '8. Droit applicable et règlement des différends',
        p: [
          'Les présentes Conditions sont régies par les lois de la République-Unie de Tanzanie. Tout différend sera d\'abord soumis à une négociation de bonne foi ; à défaut de résolution dans les trente (30) jours, l\'affaire pourra être portée devant un tribunal compétent de Tanzanie ou, au choix de la Société, par arbitrage.',
        ],
      },
      {
        h: '9. Force majeure',
        p: [
          "La Société ne sera pas responsable de tout manquement résultant de causes échappant à son contrôle raisonnable, y compris les pannes d'infrastructure électrique ou internet, les actes gouvernementaux, les catastrophes naturelles, ou les interruptions de services d'hébergement tiers.",
        ],
      },
      {
        h: '10. Divisibilité et modification',
        p: [
          'Si une disposition des présentes Conditions est jugée inapplicable, elle sera limitée dans la mesure nécessaire, les autres dispositions restant pleinement en vigueur. La Société se réserve le droit de modifier ces Conditions à tout moment.',
        ],
      },
      {
        h: '11. Langue',
        p: [
          'Les présentes Conditions sont mises à disposition en plusieurs langues par commodité. En cas de conflit entre versions linguistiques, la version anglaise prévaudra à des fins d\'interprétation, sauf disposition contraire du droit local applicable.',
        ],
      },
    ],
    footerNote: "Ce document est un modèle général de Conditions d'utilisation. Il doit être révisé par un avocat qualifié dans chaque juridiction concernée avant toute utilisation formelle.",
  },

  pt: {
    label: 'Português',
    title: 'Termos de Uso e Isenção de Responsabilidade',
    updated: 'Última atualização: julho de 2026',
    sections: [
      {
        h: '1. Aceitação dos Termos',
        p: [
          'Estes Termos de Uso e Isenção de Responsabilidade ("Termos") regem o acesso e uso da aplicação, website e serviços relacionados Moneytracer (coletivamente, o "Serviço"), operado pela Zimbermanne Company Limited, sob a marca Zimbermanne Studios ("a Empresa", "nós"). Ao criar uma conta, descarregar a aplicação ou aceder de outra forma ao Serviço, a pessoa ou entidade em questão ("Utilizador", "você") concorda em ficar vinculada a estes Termos na sua totalidade.',
        ],
      },
      {
        h: '2. Estado Beta / Em Desenvolvimento',
        p: [
          'O Serviço é atualmente oferecido numa fase de desenvolvimento ativo prévia à disponibilidade geral ("Fase Beta"). Durante esta fase, a Empresa pode modificar, suspender ou descontinuar qualquer funcionalidade do Serviço a qualquer momento, sem aviso prévio, sendo o Serviço fornecido gratuitamente por um período inicial de noventa (90) dias a partir da criação da conta do Utilizador, sujeito a alteração ao critério exclusivo da Empresa.',
          'O Utilizador reconhece que software em desenvolvimento ativo está sujeito a falhas, interrupções e alterações de comportamento, e que o uso contínuo do Serviço durante a Fase Beta é feito com pleno conhecimento deste estado.',
        ],
      },
      {
        h: '3. Ausência de Garantia',
        p: [
          'O SERVIÇO É FORNECIDO "TAL COMO ESTÁ" E "CONFORME DISPONÍVEL", SEM GARANTIAS DE QUALQUER TIPO, EXPRESSAS, IMPLÍCITAS, LEGAIS OU OUTRAS, INCLUINDO SEM LIMITAÇÃO QUAISQUER GARANTIAS IMPLÍCITAS DE COMERCIALIZAÇÃO, ADEQUAÇÃO A UM FIM ESPECÍFICO, TITULARIDADE, NÃO VIOLAÇÃO OU EXATIDÃO DOS DADOS.',
        ],
      },
      {
        h: '4. Perda e Integridade de Dados',
        p: [
          'A Empresa não será responsável, sob qualquer teoria de responsabilidade, por qualquer perda, corrupção, eliminação ou alteração não autorizada de dados — incluindo, sem limitação, registos financeiros, históricos de transações, dados de inventário ou informações de conta — decorrentes do uso do Serviço durante a Fase Beta ou de outra forma. O Utilizador é o único responsável por manter cópias de segurança ou exportações independentes de qualquer informação que considere crítica.',
        ],
      },
      {
        h: '5. Não Constitui Aconselhamento Profissional',
        p: [
          'O Serviço é uma ferramenta de registo e organização e não constitui, nem deve ser interpretado como, serviços de aconselhamento contabilístico, fiscal, jurídico ou financeiro. Os utilizadores envolvidos em acordos financeiros coletivos (incluindo grupos de poupança ou estruturas do tipo "Vikoba") permanecem os únicos responsáveis pela verificação independente dos seus registos.',
        ],
      },
      {
        h: '6. Limitação de Responsabilidade',
        p: [
          'NA MEDIDA MÁXIMA PERMITIDA PELA LEI APLICÁVEL, EM NENHUMA CIRCUNSTÂNCIA A EMPRESA, OS SEUS FUNDADORES, DIRETORES, FUNCIONÁRIOS OU AFILIADOS SERÃO RESPONSÁVEIS POR DANOS INDIRETOS, INCIDENTAIS, ESPECIAIS, CONSEQUENCIAIS OU PUNITIVOS, OU POR QUALQUER PERDA DE LUCROS, RECEITAS, DADOS OU FUNDO DE COMÉRCIO. A RESPONSABILIDADE TOTAL DA EMPRESA NÃO EXCEDERÁ O MAIOR VALOR ENTRE (A) O TOTAL PAGO PELO UTILIZADOR NOS ÚLTIMOS DOZE (12) MESES, OU (B) ZERO, DADO QUE O SERVIÇO É ATUALMENTE GRATUITO.',
        ],
      },
      {
        h: '7. Indemnização',
        p: [
          'O Utilizador concorda em indemnizar e isentar de responsabilidade a Empresa e os seus fundadores, diretores e afiliados de quaisquer reclamações, responsabilidades, danos, perdas e despesas, incluindo honorários legais razoáveis, decorrentes do acesso ou uso do Serviço pelo Utilizador, ou da sua violação destes Termos.',
        ],
      },
      {
        h: '8. Lei Aplicável e Resolução de Litígios',
        p: [
          'Estes Termos são regidos pelas leis da República Unida da Tanzânia. Qualquer litígio será primeiro submetido a negociação de boa-fé; na ausência de resolução em trinta (30) dias, a questão poderá ser levada a um tribunal competente da Tanzânia ou, por opção da Empresa, através de arbitragem.',
        ],
      },
      {
        h: '9. Força Maior',
        p: [
          'A Empresa não será responsável por qualquer falha ou atraso resultante de causas fora do seu controlo razoável, incluindo falhas de infraestrutura elétrica ou de internet, atos governamentais, desastres naturais, ou interrupções de serviços de hospedagem de terceiros.',
        ],
      },
      {
        h: '10. Divisibilidade e Alteração',
        p: [
          'Se qualquer disposição destes Termos for considerada inexequível, será limitada na medida necessária, permanecendo as restantes disposições em pleno vigor. A Empresa reserva-se o direito de alterar estes Termos a qualquer momento.',
        ],
      },
      {
        h: '11. Idioma',
        p: [
          'Estes Termos são disponibilizados em vários idiomas por conveniência. Em caso de conflito entre versões linguísticas, a versão em inglês prevalecerá para efeitos de interpretação, salvo disposição em contrário da lei local aplicável.',
        ],
      },
    ],
    footerNote: 'Este documento é um modelo geral de Termos de Uso. Deve ser revisto por um advogado qualificado em cada jurisdição relevante antes de uso formal.',
  },

  sw: {
    label: 'Kiswahili',
    title: 'Masharti ya Matumizi na Tamko la Kutowajibika',
    updated: 'Ilisasishwa mwisho: Julai 2026',
    sections: [
      {
        h: '1. Kukubali Masharti',
        p: [
          'Masharti haya ya Matumizi na Tamko la Kutowajibika ("Masharti") yanasimamia ufikiaji na matumizi ya programu ya Moneytracer, tovuti, na huduma zinazohusiana (kwa pamoja, "Huduma"), inayoendeshwa na Zimbermanne Company Limited, inayofanya biashara kama Zimbermanne Studios ("Kampuni", "sisi"). Kwa kuunda akaunti, kupakua programu, au kufikia Huduma kwa njia nyingine yoyote, mtu au taasisi husika ("Mtumiaji", "wewe") anakubali kufungwa na Masharti haya kwa ukamilifu wake.',
        ],
      },
      {
        h: '2. Hali ya Beta / Katika Maendeleo',
        p: [
          'Huduma kwa sasa inatolewa katika awamu ya maendeleo hai kabla ya upatikanaji rasmi kwa umma ("Awamu ya Beta"). Wakati wa Awamu hii, Kampuni inaweza kubadilisha, kusimamisha, au kukomesha kipengele chochote cha Huduma wakati wowote bila taarifa ya awali, na Huduma inatolewa bila malipo kwa kipindi cha awali cha siku tisini (90) tangu Mtumiaji aunde akaunti yake, ikiwa chini ya mabadiliko kwa uamuzi wa Kampuni pekee.',
          'Mtumiaji anakiri kwamba programu iliyo katika maendeleo hai kiasili inakabiliwa na dosari, usumbufu, na mabadiliko ya tabia, na kwamba matumizi endelevu ya Huduma wakati wa Awamu ya Beta yanafanywa kwa ufahamu kamili wa hali hii.',
        ],
      },
      {
        h: '3. Hakuna Dhamana',
        p: [
          'HUDUMA INATOLEWA "KAMA ILIVYO" NA "KULINGANA NA UPATIKANAJI", BILA DHAMANA YA AINA YOYOTE, IWE WAZI, YA KUDHANIWA, YA KISHERIA, AU VINGINEVYO, IKIWEMO BILA KIKOMO DHAMANA YOYOTE YA KUDHANIWA YA UBORA WA KIBIASHARA, UFAAFU KWA MADHUMUNI MAALUM, UMILIKI, KUTOKIUKA HAKI, AU USAHIHI WA DATA.',
        ],
      },
      {
        h: '4. Upotevu na Uadilifu wa Data',
        p: [
          'Kampuni haitawajibika, chini ya nadharia yoyote ya uwajibikaji, kwa upotevu wowote, uharibifu, ufutaji, au mabadiliko yasiyoidhinishwa ya data — ikiwemo bila kikomo kumbukumbu za kifedha, historia za miamala, data za bidhaa, au taarifa za akaunti — zinazotokana na matumizi ya Huduma wakati wa Awamu ya Beta au vinginevyo. Mtumiaji anawajibika peke yake kwa kutunza nakala za akiba au kutoa data kwa njia huru kwa taarifa yoyote anayoiona muhimu.',
        ],
      },
      {
        h: '5. Sio Ushauri wa Kitaalamu',
        p: [
          'Huduma ni chombo cha kutunza kumbukumbu na mpangilio, na hakijumuishi, wala hakitafsiriwa kama, huduma za ushauri wa uhasibu, kodi, kisheria, au kifedha. Watumiaji wanaoshiriki katika mipango ya kifedha ya kikundi (ikiwemo vikundi vya akiba au miundo ya aina ya "Vikoba") wanabaki kuwajibika peke yao kuhakiki kumbukumbu zao kwa kujitegemea.',
        ],
      },
      {
        h: '6. Kikomo cha Uwajibikaji',
        p: [
          'KWA KIWANGO KIKUBWA KINACHORUHUSIWA NA SHERIA HUSIKA, KAMPUNI, WAANZILISHI WAKE, WAKURUGENZI, WAFANYAKAZI, AU WASHIRIKA HAWATAWAJIBIKA KWA HASARA ZOZOTE ZISIZO ZA MOJA KWA MOJA, ZA BAHATI MBAYA, MAALUM, AU ZA MATOKEO, WALA UPOTEVU WOWOTE WA FAIDA, MAPATO, DATA, AU SIFA NJEMA YA BIASHARA. UWAJIBIKAJI WA JUMLA WA KAMPUNI HAUTAZIDI KIASI KIKUBWA KATI YA (A) JUMLA ILIYOLIPWA NA MTUMIAJI KATIKA MIEZI KUMI NA MIWILI (12) ILIYOPITA, AU (B) SIFURI, KWA KUWA HUDUMA KWA SASA INATOLEWA BILA MALIPO.',
        ],
      },
      {
        h: '7. Fidia',
        p: [
          'Mtumiaji anakubali kufidia na kuilinda Kampuni na waanzilishi wake, maafisa, na washirika dhidi ya madai yoyote, uwajibikaji, hasara, na gharama, ikiwemo ada za kisheria za busara, zinazotokana na ufikiaji au matumizi ya Huduma na Mtumiaji, au ukiukaji wa Masharti haya na Mtumiaji.',
        ],
      },
      {
        h: '8. Sheria Inayotumika na Utatuzi wa Migogoro',
        p: [
          'Masharti haya yanasimamiwa na sheria za Jamhuri ya Muungano wa Tanzania. Mgogoro wowote utawasilishwa kwanza kwa majadiliano ya nia njema; kutokupatikana kwa suluhisho ndani ya siku thelathini (30), suala hilo laweza kupelekwa mahakama yenye mamlaka nchini Tanzania au, kwa uchaguzi wa Kampuni, kupitia usuluhishi.',
        ],
      },
      {
        h: '9. Nguvu ya Kimaumbile',
        p: [
          'Kampuni haitawajibika kwa kushindwa au kuchelewa kutekeleza majukumu kunakotokana na sababu zilizo nje ya uwezo wake wa kawaida, ikiwemo kukatika kwa umeme au miundombinu ya intaneti, matendo ya kiserikali, majanga ya asili, au kukatika kwa huduma za mwenyeji wa tatu.',
        ],
      },
      {
        h: '10. Ugawanyikaji na Marekebisho',
        p: [
          'Iwapo kifungu chochote cha Masharti haya kitaonekana kutotekelezeka, kitawekewa kikomo kwa kiwango kinachohitajika, huku vifungu vingine vikibaki na nguvu kamili. Kampuni inahifadhi haki ya kurekebisha Masharti haya wakati wowote.',
        ],
      },
      {
        h: '11. Lugha',
        p: [
          'Masharti haya yanapatikana kwa lugha kadhaa kwa urahisi wa Watumiaji. Endapo kutakuwa na mgongano kati ya matoleo ya lugha, toleo la Kiingereza litashinda kwa madhumuni ya ufafanuzi, isipokuwa sheria za mahali husika zitakapoeleza vinginevyo.',
        ],
      },
    ],
    footerNote: 'Hati hii ni kielelezo cha jumla cha Masharti ya Matumizi. Inapaswa kupitiwa na wakili aliyehitimu katika kila eneo husika kabla ya kutumika rasmi.',
  },
}

export default function Legal() {
  const [lang, setLang] = useState('en')
  const c = CONTENT[lang]

  return (
    <div className="landing-page">
      <header className="landing-header">
        <div className="landing-header-inner">
          <Link to="/" className="landing-brand">
            <span className="landing-brand-mark">M</span>
            <span className="landing-brand-name">Moneytracer</span>
          </Link>
          <nav className="landing-nav">
            <Link to="/">Home</Link>
            <Link to="/download">Download app</Link>
          </nav>
        </div>
      </header>

      <section className="landing-section legal-section">
        <div className="legal-lang-switch">
          {Object.entries(CONTENT).map(([key, val]) => (
            <button
              key={key}
              className={`legal-lang-btn${lang === key ? ' active' : ''}`}
              onClick={() => setLang(key)}
            >
              {val.label}
            </button>
          ))}
        </div>

        <h1>{c.title}</h1>
        <p className="legal-updated">{c.updated}</p>

        <div className="legal-body">
          {c.sections.map((s) => (
            <div key={s.h} className="legal-clause">
              <h3>{s.h}</h3>
              {s.p.map((para, i) => (
                <p key={i}>{para}</p>
              ))}
            </div>
          ))}
        </div>

        <p className="landing-disclaimer-note">{c.footerNote}</p>
      </section>

      <footer className="landing-footer">
        <div>© {new Date().getFullYear()} Moneytracer.</div>
        <div className="landing-footer-links">
          <Link to="/login">Log in</Link>
          <Link to="/register">Sign up</Link>
          <a href="https://instagram.com/zimbermanne_studios" target="_blank" rel="noopener noreferrer">Instagram</a>
          <a href="https://facebook.com/moneytracer" target="_blank" rel="noopener noreferrer">Facebook</a>
        </div>
      </footer>
    </div>
  )
}
