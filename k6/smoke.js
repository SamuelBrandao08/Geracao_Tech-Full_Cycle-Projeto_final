import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  vus: 5,
  duration: "15s",
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<200"],
  },
};

const BASE_URL = __ENV.BASE_URL || "http://localhost:8000";
const JSON_HEADERS = { "Content-Type": "application/json" };

export function setup() {
  const unique = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;

  // Garante que a política padrão de professor suporta os 5 VUs simultâneos
  http.put(
    `${BASE_URL}/policies/professor`,
    JSON.stringify({ max_loans: 5, loan_days: 14, credential_days: 90 }),
    { headers: JSON_HEADERS },
  );

  const memberRes = http.post(
    `${BASE_URL}/members`,
    JSON.stringify({
      name: "Sócio Carga k6",
      email: `k6-${unique}@uni.edu`,
      category: "professor",
    }),
    { headers: JSON_HEADERS },
  );
  const member = memberRes.json();

  const credRes = http.post(
    `${BASE_URL}/members/${member.id}/credential`,
    null,
    { headers: { "Idempotency-Key": `idem-${unique}` } },
  );
  const credential = credRes.json();

  const bookRes = http.post(
    `${BASE_URL}/books`,
    JSON.stringify({
      title: "Designing Data-Intensive Applications",
      author: "Martin Kleppmann",
      isbn: `978-${unique}`,
      copyCodes: Array.from({ length: 10 }, (_, i) => `K6-${unique}-${i + 1}`),
    }),
    { headers: JSON_HEADERS },
  );
  const book = bookRes.json();

  return {
    token: credential.token,
    copyIds: book.copies.map((c) => c.id),
  };
}

export default function (data) {
  const copyId = data.copyIds[(__VU - 1) % data.copyIds.length];

  const policiesRes = http.get(`${BASE_URL}/policies`);
  check(policiesRes, { "GET /policies 200": (r) => r.status === 200 });

  const listRes = http.get(`${BASE_URL}/books`);
  check(listRes, { "GET /books 200": (r) => r.status === 200 });

  const loanRes = http.post(
    `${BASE_URL}/loans`,
    JSON.stringify({ credentialToken: data.token, copyId }),
    { headers: JSON_HEADERS },
  );
  check(loanRes, { "POST /loans 201": (r) => r.status === 201 });

  if (loanRes.status === 201) {
    const loanId = loanRes.json().id;
    const returnRes = http.post(`${BASE_URL}/loans/${loanId}/return`);
    check(returnRes, { "POST /loans/:id/return 200": (r) => r.status === 200 });
  }

  sleep(0.2);
}