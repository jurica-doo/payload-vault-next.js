import { LegalPage, Section, Address, V } from "../legal/LegalText";
import { LEGAL } from "../../data/legalEntity";

const H = ({ children }: { children: React.ReactNode }) => <h3 className="mt-2 font-semibold text-color-text-main">{children}</h3>;

/**
 * Datenschutzerklärung (Art. 13 GDPR) for the people who use the app:
 * Profina employees and sales partners. Clients and leads whose data is kept in
 * the sales part are informed by Profina separately (Art. 14); section 6 lists
 * the processing for transparency. Operator data: src/data/legalEntity.ts.
 */
export const DatenschutzPage = () => (
  <LegalPage title="Datenschutzerklärung">
    <Section title="1. Verantwortliche Stelle">
      <Address />
      <p>
        Telefon: <V k="phone" />
        <br />
        E-Mail: <V k="email" />
      </p>
      <p>
        Datenschutzbeauftragte/r: <V k="dataProtectionOfficer" />
      </p>
    </Section>

    <Section title="2. Worum es geht">
      <p>
        Der Profina Payload Vault ist eine interne Anwendung für Mitarbeitende und Vertriebspartner der {LEGAL.company}. Sie
        besteht aus zwei Teilen: dem persönlichen Tresor (eigene Abrechnungen, steuerrelevante Belege, Auswertungen) und dem
        Vertriebssystem (Produktion, Karriere, Provisionen, Leads, Kundinnen und Kunden, Aufgaben). Zugang erhält nur, wer von
        der Verwaltung eingeladen wurde.
      </p>
    </Section>

    <Section title="3. Hosting und technische Dienstleister">
      <p>
        Wir setzen die folgenden Dienstleister als Auftragsverarbeiter nach Art. 28 DSGVO ein. Mit allen bestehen Verträge zur
        Auftragsverarbeitung. Soweit Daten in die USA übermittelt werden, geschieht das auf Grundlage des EU-US Data Privacy
        Framework (soweit der Anbieter zertifiziert ist) bzw. der EU-Standardvertragsklauseln (Art. 46 DSGVO).
      </p>
      <H>Vercel (Auslieferung der Anwendung)</H>
      <p>
        Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723, USA, stellt die Webanwendung bereit. Dabei werden technisch
        notwendige Verbindungsdaten verarbeitet (IP-Adresse, Zeitpunkt, aufgerufene Seite, Browserangaben), um die Seiten
        auszuliefern und Angriffe abzuwehren. Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO.
      </p>
      <H>Supabase (Datenbank, Anmeldung, Dateien, Serverfunktionen)</H>
      <p>
        Supabase Inc., 970 Toa Payoh North #07-04, Singapur 318992, betreibt Datenbank, Anmeldung, Dateispeicher und
        Serverfunktionen. Speicherort der Daten: <V k="dataRegion" />. Rechtsgrundlage: Art. 6 Abs. 1 lit. b und f DSGVO.
      </p>
      <H>Resend (E-Mail-Versand)</H>
      <p>
        Resend Inc., 2261 Market Street #5039, San Francisco, CA 94114, USA, versendet die E-Mails der Anwendung: Einladungen,
        Passwort-Links und – nur wenn freigeschaltet – E-Mails an Kundinnen und Kunden. Dabei werden Empfängeradresse, Inhalt
        und Zustellstatus verarbeitet. Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO (Konto) bzw. die Grundlage der jeweiligen
        Kunden-E-Mail (siehe Abschnitt 7).
      </p>
      <H>Google Gemini (Belegerkennung)</H>
      <p>
        Wenn Sie im Tresor einen Beleg hochladen und die automatische Erkennung nutzen, wird das Bild bzw. die PDF über eine
        Serverfunktion an die Gemini-API von Google übermittelt (Google LLC, 1600 Amphitheatre Parkway, Mountain View, CA
        94043, USA, bzw. Google Ireland Limited, Gordon House, Barrow Street, Dublin 4, Irland). Zurück kommen Betrag, Datum
        und Kategorie, die Sie prüfen und ändern können. Die Datei wird dafür nur verarbeitet, nicht von Google zu eigenen
        Zwecken verwendet. Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO (von Ihnen ausgelöste Funktion).
      </p>
    </Section>

    <Section title="4. Konto und Anmeldung">
      <p>
        Für Ihr Konto verarbeiten wir Name, E-Mail-Adresse, Telefonnummer, Rolle, Karrierestufe, Zuordnung in der
        Vertriebsstruktur, Eintrittsdatum sowie Anmeldedaten (Passwort nur als sicherer Hash, optional ein zweiter Faktor über
        eine Authenticator-App). Sicherheitsrelevante Vorgänge (z. B. Rollen- und Stufenänderungen, Freigaben, Exporte) werden
        mit Zeitpunkt und handelnder Person protokolliert. Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO (Vertrag mit Profina) und
        Art. 6 Abs. 1 lit. c und f DSGVO (Nachweis- und Sicherheitspflichten).
      </p>
    </Section>

    <Section title="5. Persönlicher Tresor">
      <p>
        Hochgeladene Abrechnungen und Belege sowie die daraus gelesenen Beträge speichern wir ausschließlich für Sie. Andere
        Nutzerinnen und Nutzer – auch Führungskräfte, Verwaltung und Finanzabteilung – haben keinen Zugriff auf Ihren Tresor.
        PDFs von Abrechnungen werden in Ihrem Browser ausgelesen. Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO.
      </p>
    </Section>

    <Section title="6. Vertriebssystem: Daten von Kundinnen, Kunden und Interessenten">
      <p>
        Im Vertriebssystem werden Daten von Kundinnen, Kunden und Interessenten (Leads) gespeichert: Kontaktdaten, Anrede,
        gegebenenfalls Geburtsdatum, vermittelte Verträge, Beratungs- und Kontakthistorie, Termine, Einwilligungen und
        Widersprüche. Zweck sind Beratung, Vermittlung und Betreuung von Versicherungen sowie die Provisionsabrechnung.
        Rechtsgrundlagen: Art. 6 Abs. 1 lit. b DSGVO (Anbahnung und Durchführung von Verträgen), Art. 6 Abs. 1 lit. c DSGVO
        (Dokumentations- und Aufbewahrungspflichten, z. B. § 61 VVG, HGB, AO) und Art. 6 Abs. 1 lit. a DSGVO (Einwilligungen,
        etwa für Geburtstagsgrüße). Zugriff haben nur die betreuende Person, deren Führungskräfte sowie Verwaltung und
        Datenschutz im erforderlichen Umfang. Die Betroffenen werden von Profina gesondert nach Art. 14 DSGVO informiert.
      </p>
    </Section>

    <Section title="7. E-Mails an Kundinnen und Kunden">
      <p>
        Automatische E-Mails (z. B. Geburtstags- oder Feiertagsgrüße) gehen nur an Personen mit einer erfassten
        Rechtsgrundlage – in der Regel einer Einwilligung – und werden vor dem Versand erneut geprüft. Jede E-Mail enthält einen
        Abmeldelink; eine Abmeldung wirkt sofort. Versanddienstleister: <V k="emailProvider" />.
      </p>
    </Section>

    <Section title="8. Cookies und lokale Speicherung">
      <p>
        Wir verwenden nur technisch notwendige Speicherungen: Ihre Anmeldung (im lokalen Speicher des Browsers), die
        Einstellung für helles oder dunkles Design, die gewählte Seitengröße von Listen und Ihre Cookie-Auswahl. Es gibt kein
        Tracking und keine Werbe- oder Analyse-Cookies. Rechtsgrundlage: § 25 Abs. 2 Nr. 2 TDDDG, Art. 6 Abs. 1 lit. f DSGVO.
      </p>
    </Section>

    <Section title="9. Speicherdauer">
      <p>
        Wir speichern personenbezogene Daten, solange sie für die genannten Zwecke erforderlich sind. Danach werden sie gelöscht,
        sofern keine gesetzlichen Aufbewahrungspflichten bestehen (insbesondere sechs bzw. zehn Jahre nach HGB und AO für
        Abrechnungs- und Buchungsunterlagen). Bei einer Löschung von Kundendaten bleiben Verträge und Abrechnungen ohne Bezug
        zur Person erhalten.
      </p>
    </Section>

    <Section title="10. Ihre Rechte">
      <p>
        Sie haben das Recht auf Auskunft (Art. 15 DSGVO), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung der
        Verarbeitung (Art. 18), Datenübertragbarkeit (Art. 20) und Widerspruch (Art. 21). Eine Einwilligung können Sie jederzeit
        mit Wirkung für die Zukunft widerrufen (Art. 7 Abs. 3). Wenden Sie sich dazu an die oben genannte Stelle.
      </p>
      <p>
        Sie können sich außerdem bei einer Datenschutz-Aufsichtsbehörde beschweren (Art. 77 DSGVO), zum Beispiel bei der für
        uns zuständigen Landesbeauftragten für Datenschutz und Informationsfreiheit Nordrhein-Westfalen, Kavalleriestraße 2–4,
        40213 Düsseldorf.
      </p>
    </Section>

    <Section title="11. Datensicherheit">
      <p>
        Alle Verbindungen sind verschlüsselt (TLS). Zugriffe werden in der Datenbank je Rolle und Struktur geprüft; Verwaltungs-
        und Finanzfunktionen erfordern eine Zwei-Faktor-Anmeldung. Sicherheitsrelevante Änderungen werden unveränderbar
        protokolliert.
      </p>
    </Section>

    <p className="text-xs text-color-text-subtle">Stand: {LEGAL.asOf}</p>
  </LegalPage>
);
