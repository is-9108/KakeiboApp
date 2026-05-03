export interface Transaction {
  id: number;
  categoryId: number;
  amount: number;
  memo: string;
  insertDate: string;
}

export interface Category {
  id: number;
  name: string;
  isIncome: boolean;
}

export interface Subscription {
  id: number;
  name: string;
  amount: number;
}

export interface Monthly {
  id: number;
  shuusi: number;
  kyuuryo: number;
  sonotaShuunyuu: number;
  yatin: number;
  shokuhi: number;
  kootsuuhi: number;
  gaishokuhi: number;
  nichiyouhin: number;
  shoseki: number;
  subscription: number;
  koutsuuhi: number;
  suidouhi: number;
  fuku: number;
  sonotaShishutsu: number;
}
