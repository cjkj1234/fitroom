import type {Product,SizeMeasurements} from './types';

const common={checkedAt:'2026-09-21',measurementBasis:'소상공인 판매자 등록 흐름을 보여주기 위한 시연용 실측 데이터입니다. 누락된 값은 비교하지 않습니다.',source:'demo' as const};
type DemoProduct=Omit<Product,'checkedAt'|'url'|'image'|'source'>&{assetId:string};
function product({assetId,...item}:DemoProduct):Product{return {...common,...item,url:'',image:`/catalog/${assetId}.png`};}
const tees=(rows:number[][],labels:string[]):SizeMeasurements[]=>rows.map((row,index)=>({label:labels[index],length:row[0],shoulder:row[1],chestFlat:row[2],sleeve:row[3]}));
const pants=(rows:number[][],labels:string[]):SizeMeasurements[]=>rows.map((row,index)=>({label:labels[index],length:row[0],waistFlat:row[1],hipsFlat:row[2],thighFlat:row[3],rise:row[4]||undefined,hemFlat:row[5]}));

export const PRODUCTS:Product[]=[
 product({id:'3777371',assetId:'3777371',slot:'top',brand:'오후옷장',name:'포인트 오버핏 반팔',color:'#24272b',colorName:'블랙',silhouette:'tee',defaultSize:'M',sizes:tees([[68,50,51.5,22],[70,52,55,23],[72,54,58.5,24],[74,56,62,25],[76,58,65.5,26]],['S','M','L','XL','XXL']),priceKrw:29000,stock:8,note:'소상공인 상점 입점 예시입니다. 로고·소매 장식은 간략화한 3D 표현입니다.'}),
 product({id:'6170660',assetId:'6170660',slot:'top',brand:'모퉁이상점',name:'스트라이프 데일리 반팔',color:'#eeece8',colorName:'화이트 스트라이프',silhouette:'stripe',defaultSize:'M',sizes:tees([[71,56,56,22],[75,59,61,24]],['M','L']),priceKrw:32000,stock:5,note:'소상공인 상점 입점 예시입니다. 스트라이프 간격과 봉제 디테일은 간략화했습니다.'}),
 product({id:'4964048',assetId:'4964048',slot:'top',brand:'골목테일러',name:'쿨링 브이넥 반팔',color:'#34363b',colorName:'차콜 블랙',silhouette:'vneck',defaultSize:'L',sizes:[[101,66.5],[106,68],[111,69.5],[116,71],[121,71.5]].map((row,index)=>({label:['M','L','XL','2XL','3XL'][index],chestCirc:row[0],length:row[1]})),priceKrw:36000,stock:11,note:'소상공인 상점 입점 예시입니다. 목선과 세부 장식은 간략화했습니다.'}),
 product({id:'3504218',assetId:'3504218',slot:'bottom',brand:'골목테일러',name:'투 턱 와이드 슬랙스',color:'#a99c88',colorName:'그레이쉬 베이지',silhouette:'wide',defaultSize:'30',sizes:pants([[106,37.5,54,34.5,31,25],[107,40,56.5,35.75,31.5,25.5],[107,42.5,59,37,32,26],[108,45,61.5,38.25,33,26.5]],['28','30','32','34']),priceKrw:59000,stock:6,note:'소상공인 상점 입점 예시입니다. 원단의 주름과 투 턱 구조는 간략화했습니다.'}),
 product({id:'5196637',assetId:'5196637',slot:'bottom',brand:'오후옷장',name:'라이트 밴딩 와이드 팬츠',color:'#282a2c',colorName:'매트 블랙',silhouette:'wide',defaultSize:'M',elasticWaist:true,sizes:pants([[95,30,46,46,0,27],[96,33,48,48,0,28],[99,35,51,51,0,29],[100,38,53,53,0,29]],['S','M','L','XL']),priceKrw:42000,stock:3,note:'소상공인 상점 입점 예시입니다. 밑위 실측이 없어 해당 3D 형태는 참고용이며 밴딩의 늘어남은 계산하지 않습니다.'}),
 product({id:'3547134',assetId:'3547134',slot:'bottom',brand:'모퉁이상점',name:'워싱 스트레이트 팬츠',color:'#646268',colorName:'차콜',silhouette:'straight',defaultSize:'M',sizes:[{label:'M',waistFlat:42.5,rise:35,thighFlat:32,hemFlat:25.5,length:111},{label:'L',waistFlat:45,rise:36,thighFlat:33,hemFlat:26.5,length:113}],priceKrw:54000,stock:4,note:'소상공인 상점 입점 예시입니다. 엉덩이 실측이 없어 해당 핏 판단을 보류하며 워싱과 절개선은 간략화했습니다.'}),
 product({id:'5067714',assetId:'5067714',slot:'hat',brand:'모퉁이상점',name:'나일론 데일리 볼캡',color:'#22272a',colorName:'블랙',silhouette:'cap',defaultSize:'58',adjustableHat:true,sizes:[{label:'56',headCirc:56},{label:'58',headCirc:58}],priceKrw:27000,stock:12,note:'소상공인 상점 입점 예시입니다. 조절 가능 범위가 없어 핏 판단을 보류합니다.'}),
 product({id:'4658117',assetId:'4658117',slot:'hat',brand:'오후옷장',name:'코튼 베이스볼캡',color:'#c6bba7',colorName:'베이지',silhouette:'cap',defaultSize:'58',adjustableHat:true,sizes:[{label:'56',headCirc:56},{label:'58',headCirc:58},{label:'60',headCirc:60}],priceKrw:25000,stock:7,note:'소상공인 상점 입점 예시입니다. 로고와 봉제선은 간략화했습니다.'}),
];

export const SLOT_LABELS={hat:'모자',top:'상의',bottom:'하의'};
export const getProduct=(id:string)=>PRODUCTS.find(product=>product.id===id);
