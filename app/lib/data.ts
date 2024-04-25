import { sql } from '@vercel/postgres';
import {
  CustomerField,
  CustomersTableType,
  InvoiceForm,
  InvoicesTable,
  LatestInvoiceRaw,
  User,
  Revenue,
} from './definitions';
import { formatCurrency } from './utils';

export async function fetchRevenue() {
  // Add noStore() here to prevent the response from being cached.
  // This is equivalent to in fetch(..., {cache: 'no-store'}).

  try {
    // Artificially delay a response for demo purposes.
    // Don't do this in production :)

    // console.log('Fetching revenue data...');
    // await new Promise((resolve) => setTimeout(resolve, 3000));

    const data = await sql<Revenue>`SELECT * FROM ndb_revenue`;

    // console.log('Data fetch completed after 3 seconds.');

    return data.rows;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch revenue data.');
  }
}

export async function fetchLatestInvoices() {
  try {
    const data = await sql<LatestInvoiceRaw>`
      SELECT ndb_invoices.amount, ndb_customers.name, ndb_customers.image_url, ndb_customers.email, ndb_invoices.id
      FROM ndb_invoices
      JOIN ndb_customers ON ndb_invoices.customer_id = ndb_customers.id
      ORDER BY ndb_invoices.date DESC
      LIMIT 5`;

    const latestInvoices = data.rows.map((invoice) => ({
      ...invoice,
      amount: formatCurrency(invoice.amount),
    }));
    return latestInvoices;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch the latest invoices.');
  }
}

export async function fetchCardData() {
  try {
    // You can probably combine these into a single SQL query
    // However, we are intentionally splitting them to demonstrate
    // how to initialize multiple queries in parallel with JS.
    const invoiceCountPromise = sql`SELECT COUNT(*) FROM ndb_invoices`;
    const customerCountPromise = sql`SELECT COUNT(*) FROM ndb_customers`;
    const invoiceStatusPromise = sql`SELECT
         SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END) AS "paid",
         SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END) AS "pending"
         FROM ndb_invoices`;

    const data = await Promise.all([
      invoiceCountPromise,
      customerCountPromise,
      invoiceStatusPromise,
    ]);

    const numberOfInvoices = Number(data[0].rows[0].count ?? '0');
    const numberOfCustomers = Number(data[1].rows[0].count ?? '0');
    const totalPaidInvoices = formatCurrency(data[2].rows[0].paid ?? '0');
    const totalPendingInvoices = formatCurrency(data[2].rows[0].pending ?? '0');

    return {
      numberOfCustomers,
      numberOfInvoices,
      totalPaidInvoices,
      totalPendingInvoices,
    };
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch card data.');
  }
}

const ITEMS_PER_PAGE = 6;
export async function fetchFilteredInvoices(
  query: string,
  currentPage: number,
) {
  const offset = (currentPage - 1) * ITEMS_PER_PAGE;

  try {
    const invoices = await sql<InvoicesTable>`
      SELECT
        ndb_invoices.id,
        ndb_invoices.amount,
        ndb_invoices.date,
        ndb_invoices.status,
        ndb_customers.name,
        ndb_customers.email,
        ndb_customers.image_url
      FROM ndb_invoices
      JOIN ndb_customers ON ndb_invoices.customer_id = ndb_customers.id
      WHERE
        ndb_customers.name ILIKE ${`%${query}%`} OR
        ndb_customers.email ILIKE ${`%${query}%`} OR
        ndb_invoices.amount::text ILIKE ${`%${query}%`} OR
        ndb_invoices.date::text ILIKE ${`%${query}%`} OR
        ndb_invoices.status ILIKE ${`%${query}%`}
      ORDER BY ndb_invoices.date DESC
      LIMIT ${ITEMS_PER_PAGE} OFFSET ${offset}
    `;

    return invoices.rows;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch invoices.');
  }
}

export async function fetchInvoicesPages(query: string) {
  try {
    const count = await sql`SELECT COUNT(*)
    FROM ndb_invoices
    JOIN ndb_customers ON ndb_invoices.customer_id = ndb_customers.id
    WHERE
      ndb_customers.name ILIKE ${`%${query}%`} OR
      ndb_customers.email ILIKE ${`%${query}%`} OR
      ndb_invoices.amount::text ILIKE ${`%${query}%`} OR
      ndb_invoices.date::text ILIKE ${`%${query}%`} OR
      ndb_invoices.status ILIKE ${`%${query}%`}
  `;

    const totalPages = Math.ceil(Number(count.rows[0].count) / ITEMS_PER_PAGE);
    return totalPages;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch total number of invoices.');
  }
}

export async function fetchInvoiceById(id: string) {
  try {
    const data = await sql<InvoiceForm>`
      SELECT
        ndb_invoices.id,
        ndb_invoices.customer_id,
        ndb_invoices.amount,
        ndb_invoices.status
      FROM ndb_invoices
      WHERE ndb_invoices.id = ${id};
    `;

    const invoice = data.rows.map((invoice) => ({
      ...invoice,
      // Convert amount from cents to dollars
      amount: invoice.amount / 100,
    }));

    return invoice[0];
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch invoice.');
  }
}

export async function fetchCustomers() {
  try {
    const data = await sql<CustomerField>`
      SELECT
        id,
        name
      FROM ndb_customers
      ORDER BY name ASC
    `;

    const customers = data.rows;
    return customers;
  } catch (err) {
    console.error('Database Error:', err);
    throw new Error('Failed to fetch all customers.');
  }
}

export async function fetchFilteredCustomers(query: string) {
  try {
    const data = await sql<CustomersTableType>`
		SELECT
		  ndb_customers.id,
		  ndb_customers.name,
		  ndb_customers.email,
		  ndb_customers.image_url,
		  COUNT(ndb_invoices.id) AS total_invoices,
		  SUM(CASE WHEN ndb_invoices.status = 'pending' THEN ndb_invoices.amount ELSE 0 END) AS total_pending,
		  SUM(CASE WHEN ndb_invoices.status = 'paid' THEN ndb_invoices.amount ELSE 0 END) AS total_paid
		FROM ndb_customers
		LEFT JOIN ndb_invoices ON ndb_customers.id = ndb_invoices.customer_id
		WHERE
    ndb_customers.name ILIKE ${`%${query}%`} OR
    ndb_customers.email ILIKE ${`%${query}%`}
		GROUP BY ndb_customers.id, ndb_customers.name, ndb_customers.email, ndb_customers.image_url
		ORDER BY ndb_customers.name ASC
	  `;

    const customers = data.rows.map((customer) => ({
      ...customer,
      total_pending: formatCurrency(customer.total_pending),
      total_paid: formatCurrency(customer.total_paid),
    }));

    return customers;
  } catch (err) {
    console.error('Database Error:', err);
    throw new Error('Failed to fetch customer table.');
  }
}

export async function getUser(email: string) {
  try {
    const user = await sql`SELECT * FROM ndb_users WHERE email=${email}`;
    return user.rows[0] as User;
  } catch (error) {
    console.error('Failed to fetch user:', error);
    throw new Error('Failed to fetch user.');
  }
}
