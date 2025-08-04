fetch('/apps/custom-filter?vendor=nike&type=shoes&priceMin=1000&priceMax=5000')
  .then(res => res.json())
  .then(data => console.log(data));