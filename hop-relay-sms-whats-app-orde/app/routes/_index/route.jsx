import { redirect, Form, useLoaderData } from "react-router";
import { login } from "../../shopify.server";
import styles from "./styles.module.css";

export const loader = async ({ request }) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData();

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>
          Turn Shopify orders into instant SMS & WhatsApp updates
        </h1>
        <p className={styles.text}>
          HopRelay connects your Shopify store to your Android SMS and WhatsApp
          senders so customers get real-time order notifications without any
          complex setup.
        </p>
        {showForm && (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>Shop domain</span>
              <input className={styles.input} type="text" name="shop" />
              <span>e.g: my-shop-domain.myshopify.com</span>
            </label>
            <button className={styles.button} type="submit">
              Log in
            </button>
          </Form>
        )}
        <ul className={styles.list}>
          <li>
            <strong>Automated order alerts</strong>. Send SMS or WhatsApp
            messages when orders are created and fulfilled, using templates you
            control.
          </li>
          <li>
            <strong>Use your own devices</strong>. Deliver messages through your
            existing Android phones or WhatsApp accounts connected to HopRelay.
          </li>
          <li>
            <strong>Simple setup for merchants</strong>. Link your HopRelay
            account, choose a plan, and start sending in a few clicks.
          </li>
        </ul>
      </div>
    </div>
  );
}
