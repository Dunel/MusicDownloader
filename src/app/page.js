import Header from "./components/Header";
import ContainerWeb from "./components/ContainerWeb";
import GridContainer from "./components/GridContainer";

export default function Home() {
  return (
    <>
      <Header title={"ORPHEE Downloader"} />
      <ContainerWeb>
        <GridContainer>
          We are your local tool for downloading music quickly, safely, and
          easily. At Orphee, we understand the importance of having access to
          your favorite music without complications, which is why we have
          created an intuitive and efficient software that allows you to get
          your favorite songs directly to your device.
        </GridContainer>
      </ContainerWeb>
    </>
  );
}
