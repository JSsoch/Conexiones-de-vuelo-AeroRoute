

from math import isfinite
from typing import Dict


def normalizar_codigo(codigo: str) -> str:
    """Normaliza un código y exige dos o tres letras ASCII, como GUA o BR."""
    if not isinstance(codigo, str):
        raise ValueError(
            "El código del aeropuerto debe ser un texto de dos o tres letras."
        )
    codigo = codigo.strip()
    if (
        len(codigo) not in (2, 3)
        or not codigo.isascii()
        or not codigo.isalpha()
    ):
        raise ValueError(
            "El código del aeropuerto debe contener dos o tres letras de A a Z."
        )
    return codigo.upper()


class GrafoAeropuertos:
    """Red de vuelos dirigidos con distancias en kilómetros.

    Cada instancia mantiene su propio catálogo de nombres y su propio grafo.
    Los vuelos de regreso se registran por separado o con bidireccional=True.
    """

    def __init__(self) -> None:
        self.aeropuertos: Dict[str, str] = {}
        self.grafo: Dict[str, Dict[str, float]] = {}

    def registrar_aeropuerto(self, codigo: str, nombre: str) -> None:
        """Agrega un aeropuerto sin conexiones; rechaza códigos repetidos."""
        codigo = normalizar_codigo(codigo)
        if not isinstance(nombre, str) or not nombre.strip():
            raise ValueError("El nombre del aeropuerto no puede estar vacío.")
        if codigo in self.aeropuertos:
            raise ValueError(f"El aeropuerto '{codigo}' ya está registrado.")

        self.aeropuertos[codigo] = nombre.strip()
        self.grafo[codigo] = {}

    def registrar_vuelo(
        self,
        origen: str,
        destino: str,
        distancia_km: float,
        bidireccional: bool = False,
        actualizar: bool = False,
    ) -> bool:
        """Agrega o actualiza un vuelo entre aeropuertos registrados.

        La distancia debe ser finita y mayor que cero. No se permiten vuelos
        al mismo aeropuerto. Si la conexión ya existe, se lanza un ValueError
        claro salvo que actualizar sea True. Si se solicita ida y vuelta, ambas
        conexiones se validan antes de modificar el grafo.

        Devuelve True cuando la arista ya existía y su peso fue actualizado;
        devuelve False cuando la conexión se creó desde cero.
        """
        origen = normalizar_codigo(origen)
        destino = normalizar_codigo(destino)
        for codigo in (origen, destino):
            if codigo not in self.grafo:
                raise ValueError(f"El aeropuerto '{codigo}' no está registrado.")
        if origen == destino:
            raise ValueError("El origen y el destino deben ser diferentes.")

        if isinstance(distancia_km, bool):
            raise ValueError("La distancia debe ser un número positivo en kilómetros.")
        try:
            distancia = float(distancia_km)
        except (TypeError, ValueError, OverflowError):
            raise ValueError(
                "La distancia debe ser un número positivo en kilómetros."
            ) from None
        if not isfinite(distancia) or distancia <= 0:
            raise ValueError("La distancia debe ser finita y mayor que cero.")

        existe_ida = destino in self.grafo[origen]
        existe_vuelta = bidireccional and origen in self.grafo[destino]

        if not actualizar:
            if existe_ida:
                raise ValueError(
                    f"El vuelo {origen} -> {destino} ya está registrado."
                )
            if existe_vuelta:
                raise ValueError(
                    f"El vuelo {destino} -> {origen} ya está registrado."
                )

        self.grafo[origen][destino] = distancia
        if bidireccional:
            self.grafo[destino][origen] = distancia

        return existe_ida or existe_vuelta

    def mostrar_aeropuertos(self) -> None:
        """Muestra los códigos y nombres de los aeropuertos registrados."""
        print("\nAEROPUERTOS REGISTRADOS")
        if not self.aeropuertos:
            print("No hay aeropuertos registrados.")
            return
        for codigo, nombre in sorted(self.aeropuertos.items()):
            print(f"  {codigo}: {nombre}")

    def mostrar_conexiones(self) -> None:
        """Muestra destinos y kilómetros, incluidos los nodos sin salidas."""
        print("\nCONEXIONES DISPONIBLES (km)")
        if not self.grafo:
            print("No hay aeropuertos registrados.")
            return
        for origen, conexiones in sorted(self.grafo.items()):
            if not conexiones:
                print(f"  {origen}: sin vuelos de salida.")
            for destino, distancia in sorted(conexiones.items()):
                print(f"  {origen} -> {destino}: {distancia:,.2f} km")


def crear_red_ejemplo() -> GrafoAeropuertos:
    """Crea una red independiente con distancias ilustrativas en kilómetros."""
    red = GrafoAeropuertos()
    for codigo, nombre in (
        ("GUA", "La Aurora, Guatemala"),
        ("MEX", "Ciudad de México"),
        ("MIA", "Miami"),
        ("MAD", "Madrid-Barajas"),
    ):
        red.registrar_aeropuerto(codigo, nombre)

    for origen, destino, distancia in (
        ("GUA", "MEX", 1055.0),
        ("GUA", "MIA", 1645.0),
        ("MEX", "MIA", 2055.0),
        ("MEX", "MAD", 9065.0),
        ("MIA", "MAD", 7105.0),
    ):
        red.registrar_vuelo(origen, destino, distancia)
    return red


if __name__ == "__main__":
    red = crear_red_ejemplo()
    print("===== AEROROUTE: RED DE EJEMPLO =====")
    print("Distancias ilustrativas en kilómetros.")
    red.mostrar_aeropuertos()
    red.mostrar_conexiones()
