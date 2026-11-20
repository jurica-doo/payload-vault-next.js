import { LegalPage, Section, Address, V } from "../legal/LegalText";

/**
 * Impressum (§ 5 DDG, § 18 MStV) with the information an insurance
 * intermediary must give (§ 15 VersVermV). Operator data: src/data/legalEntity.ts.
 */
export const ImpressumPage = () => (
  <LegalPage title="Impressum">
    <Section title="Angaben gemäß § 5 DDG">
      <Address />
      <p>
        Vertreten durch die Geschäftsführung: <V k="management" />
      </p>
    </Section>

    <Section title="Kontakt">
      <p>
        Telefon: <V k="phone" />
        <br />
        E-Mail: <V k="email" />
      </p>
    </Section>

    <Section title="Registereintrag">
      <p>
        Registergericht: <V k="registerCourt" />
        <br />
        Registernummer: <V k="registerNumber" />
      </p>
    </Section>

    <Section title="Umsatzsteuer-Identifikationsnummer">
      <p>
        Umsatzsteuer-Identifikationsnummer gemäß § 27a Umsatzsteuergesetz: <V k="vatId" />
      </p>
    </Section>

    <Section title="Angaben zur Versicherungsvermittlung">
      <p>
        Status: <V k="intermediaryStatus" />
        <br />
        Erlaubnis- und Registrierungsbehörde: <V k="permittingAuthority" />
        <br />
        Registrierungsnummer im Vermittlerregister: <V k="registerNumberIntermediary" />
      </p>
      <p>
        Die Eintragung kann im Vermittlerregister überprüft werden: Deutsche Industrie- und Handelskammer (DIHK),
        Breite Straße 29, 10178 Berlin, www.vermittlerregister.info.
      </p>
      <p>
        Berufsrechtliche Regelungen: § 34d Gewerbeordnung, §§ 59–68 Versicherungsvertragsgesetz (VVG),
        Versicherungsvermittlungsverordnung (VersVermV); abrufbar unter www.gesetze-im-internet.de.
      </p>
      <p>
        Beteiligungen an oder von Versicherungsunternehmen (mindestens 10 % der Stimmrechte oder des Kapitals):{" "}
        <V k="holdings" />
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
