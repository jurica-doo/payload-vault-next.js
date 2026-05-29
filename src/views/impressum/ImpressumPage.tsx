import Link from "next/link";
import { VaultIcon } from "../../components/icons";
import { MiniFooter } from "../../components/footer/MiniFooter";

export const ImpressumPage = () => {
  return (
    <div className="flex flex-col min-h-screen">
      <main className="flex-1 mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 lg:px-8 animate-fade-in">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-color-primary no-underline mb-8 hover:opacity-80 transition-opacity py-3"
        >
          <VaultIcon className="w-6 h-6" />
          <span className="font-semibold text-sm">Zurück zur Startseite</span>
        </Link>

        <h1 className="text-color-text-main mb-8">Impressum</h1>

        <div className="flex flex-col gap-8 text-color-text-secondary text-sm sm:text-base leading-relaxed">
          <section>
            <h3 className="text-color-primary mb-3">Angaben gemäß § 5 TMG</h3>
            <p className="text-color-text-secondary">
              [First and last name]
              <br />
              PayloadVault – Digitale Belegverwaltung
              <br />
              [Street and house number]
              <br />
              [Postal code and city]
              <br />
              Deutschland
            </p>
          </section>

          <section>
            <h3 className="text-color-primary mb-3">Kontakt</h3>
            <p className="text-color-text-secondary">
              Telefon: [Phone number]
              <br />
              E-Mail: [Email address]
            </p>
          </section>

          <section>
            <h3 className="text-color-primary mb-3">
              Umsatzsteuer-Identifikationsnummer
            </h3>
            <p className="text-color-text-secondary">
              Umsatzsteuer-Identifikationsnummer gemäß § 27 a
              Umsatzsteuergesetz:
              <br />
              [VAT identification number, e.g. DE 123 456 789]
            </p>
          </section>

          <section>
            <h3 className="text-color-primary mb-3">
              Verantwortlich für den Inhalt nach § 55 Abs. 2 RStV
            </h3>
            <p className="text-color-text-secondary">
              [First and last name]
              <br />
              [Street and house number]
              <br />
              [Postal code and city]
            </p>
          </section>

          <section>
            <h3 className="text-color-primary mb-3">EU-Streitschlichtung</h3>
            <p className="text-color-text-secondary">
              Die Europäische Kommission stellt eine Plattform zur
              Online-Streitbeilegung (OS) bereit. Unsere E-Mail-Adresse finden
              Sie oben im Impressum.
            </p>
            <p className="text-color-text-secondary mt-2">
              Wir sind nicht bereit oder verpflichtet, an
              Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle
              teilzunehmen.
            </p>
          </section>

          <section>
            <h3 className="text-color-primary mb-3">Haftung für Inhalte</h3>
            <p className="text-color-text-secondary">
              Als Diensteanbieter sind wir gemäß § 7 Abs. 1 TMG für eigene
              Inhalte auf diesen Seiten nach den allgemeinen Gesetzen
              verantwortlich. Nach §§ 8 bis 10 TMG sind wir als Diensteanbieter
              jedoch nicht verpflichtet, übermittelte oder gespeicherte fremde
              Informationen zu überwachen oder nach Umständen zu forschen, die
              auf eine rechtswidrige Tätigkeit hinweisen.
            </p>
            <p className="text-color-text-secondary mt-2">
              Verpflichtungen zur Entfernung oder Sperrung der Nutzung von
              Informationen nach den allgemeinen Gesetzen bleiben hiervon
              unberührt. Eine diesbezügliche Haftung ist jedoch erst ab dem
              Zeitpunkt der Kenntnis einer konkreten Rechtsverletzung möglich.
              Bei Bekanntwerden von entsprechenden Rechtsverletzungen werden wir
              diese Inhalte umgehend entfernen.
            </p>
          </section>

          <section>
            <h3 className="text-color-primary mb-3">Haftung für Links</h3>
            <p className="text-color-text-secondary">
              Unser Angebot enthält Links zu externen Websites Dritter, auf
              deren Inhalte wir keinen Einfluss haben. Deshalb können wir für
              diese fremden Inhalte auch keine Gewähr übernehmen. Für die
              Inhalte der verlinkten Seiten ist stets der jeweilige Anbieter
              oder Betreiber der Seiten verantwortlich. Die verlinkten Seiten
              wurden zum Zeitpunkt der Verlinkung auf mögliche Rechtsverstöße
              überprüft. Rechtswidrige Inhalte waren zum Zeitpunkt der
              Verlinkung nicht erkennbar.
            </p>
            <p className="text-color-text-secondary mt-2">
              Eine permanente inhaltliche Kontrolle der verlinkten Seiten ist
              jedoch ohne konkrete Anhaltspunkte einer Rechtsverletzung nicht
              zumutbar. Bei Bekanntwerden von Rechtsverletzungen werden wir
              derartige Links umgehend entfernen.
            </p>
          </section>

          <section>
            <h3 className="text-color-primary mb-3">Urheberrecht</h3>
            <p className="text-color-text-secondary">
              Die durch die Seitenbetreiber erstellten Inhalte und Werke auf
              diesen Seiten unterliegen dem deutschen Urheberrecht. Die
              Vervielfältigung, Bearbeitung, Verbreitung und jede Art der
              Verwertung außerhalb der Grenzen des Urheberrechtes bedürfen der
              schriftlichen Zustimmung des jeweiligen Autors bzw. Erstellers.
              Downloads und Kopien dieser Seite sind nur für den privaten, nicht
              kommerziellen Gebrauch gestattet.
            </p>
            <p className="text-color-text-secondary mt-2">
              Soweit die Inhalte auf dieser Seite nicht vom Betreiber erstellt
              wurden, werden die Urheberrechte Dritter beachtet. Insbesondere
              werden Inhalte Dritter als solche gekennzeichnet. Sollten Sie
              trotzdem auf eine Urheberrechtsverletzung aufmerksam werden,
              bitten wir um einen entsprechenden Hinweis. Bei Bekanntwerden von
              Rechtsverletzungen werden wir derartige Inhalte umgehend
              entfernen.
            </p>
          </section>
        </div>
      </main>
      <MiniFooter />
    </div>
  );
};
