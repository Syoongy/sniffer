const fastFlatten = <Type>(arr: Type[][]) => {
  let temp: Type[] = [];
  temp = temp.concat.apply([], arr);
  return temp;
};

export default fastFlatten;
