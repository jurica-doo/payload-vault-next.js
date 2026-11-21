import { LegalPage, Section, Address, V } from "../legal/LegalText";
import { LEGAL } from "../../data/legalEntity";

/**
 * Impressum (§ 5 DDG, § 18 MStV) with the information a bound insurance
 * agent must give (§ 11a GewO, § 15 VersVermV). Operator data:
 * src/data/legalEntity.ts (taken from the Impressum of profina-vuletic.de).
 */
export const ImpressumPage = () => (
  <LegalPage title="Impressum">
    <Section title="Angaben gemäß § 5 DDG">
      <Address />
      <p>
        Diese Anwendung wird von {LEGAL.operator} in Vertretung der {LEGAL.principal}, {LEGAL.principalAddress},
        betrieben.
      </p>
    </Section>

    <Section title="Kontakt">
      <p>
        Telefon: <V k="phone" />
        <br />
        E-Mail: <V k="email" />
      </p>
    </Section>

    <Section title="Umsatzsteuer">
      <p>
        <V k="vat" />
      </p>
    </Section>

    <Section title="Angaben zur Versicherungsvermittlung (§ 11a GewO)">
      <p>
        Tätigkeit: <V k="intermediaryStatus" />
        <br />
        Registrierungsnummer: <V k="registerNumberIntermediary" />
        <br />
        Registerstelle: <V k="registerAuthority" />
      </p>
      <p>
        Die Eintragung kann im Vermittlerregister überprüft werden: Deutsche Industrie- und Handelskammer (DIHK),
        Breite Straße 29, 10178 Berlin, www.vermittlerregister.info.
      </p>
      <p>
        Haftungsübernehmendes Versicherungsunternehmen: <V k="liableInsurer" />
      </p>
      <p>
        Berufsrechtliche Regelungen: § 34d Gewerbeordnung, §§ 59–68 Versicherungsvertragsgesetz (VVG),
        Versicherungsvermittlungsverordnung (VersVermV); abrufbar unter www.gesetze-im-internet.de.
      </p>
    </Section>

    <Section title="Schlichtungsstellen">
      <p>
        Bei Streitigkeiten aus der Versicherungsvermittlung können Sie sich an die folgenden Schlichtungsstellen wenden:
      </p>
      <p>
        Versicherungsombudsmann e.V., Postfach 08 06 32, 10006 Berlin, www.versicherungsombudsmann.de
        <br />
        Ombudsmann Private Kranken- und Pflegeversicherung, Postfach 06 02 22, 10052 Berlin, www.pkv-ombudsmann.de
      </p>
      <p>
        Wir nehmen an Streitbeilegungsverfahren vor diesen Schlichtungsstellen teil. Zur Teilnahme an
        Streitbeilegungsverfahren vor anderen Verbraucherschlichtungsstellen (§ 36 VSBG) sind wir weder verpflichtet noch
        bereit.
      </p>
    </Section>

    <Section title="Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV">
      <p>
        <V k="contentResponsible" />
      </p>
    </Section>

    <Section title="Haftung für Inhalte und Links">
      <p>
        Wir sind für eigene Inhalte dieser Anwendung nach den allgemeinen Gesetzen verantwortlich. Für Inhalte verlinkter
        Websites Dritter sind deren Anbieter verantwortlich; rechtswidrige Inhalte waren zum Zeitpunkt der Verlinkung
        nicht erkennbar. Sobald uns eine Rechtsverletzung bekannt wird, entfernen wir den betreffenden Inhalt oder Link
        umgehend.
      </p>
    </Section>

    <Section title="Urheberrecht">
      <p>
        Die Inhalte und Werke dieser Anwendung unterliegen dem deutschen Urheberrecht. Vervielfältigung, Bearbeitung,
        Verbreitung und jede Verwertung außerhalb der Grenzen des Urheberrechts bedürfen der schriftlichen Zustimmung.
      </p>
    </Section>
  </LegalPage>
);
