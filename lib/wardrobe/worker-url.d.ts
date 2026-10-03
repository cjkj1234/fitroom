// Vite가 Worker 파일을 따로 묶고 그 주소를 돌려주는 가져오기(`파일?worker&url`)의 타입.
declare module '*?worker&url'{const url:string;export default url;}
